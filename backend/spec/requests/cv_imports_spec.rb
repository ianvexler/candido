require "rails_helper"

RSpec.describe "CV imports" do
  include ActiveJob::TestHelper

  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  before do
    ActiveJob::Base.queue_adapter = :test
    allow(CvImports::Extractor).to receive(:configured?).and_return(true)
  end

  def upload(content, filename, type)
    Rack::Test::UploadedFile.new(StringIO.new(content), type, original_filename: filename)
  end

  let(:pdf) { upload("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "cv.pdf", "application/pdf") }

  describe "POST /api/v1/cv_imports" do
    it "stores a PDF and starts reading it" do
      expect {
        post "/api/v1/cv_imports", params: { file: pdf }, headers: headers
      }.to have_enqueued_job(CvImportJob)

      expect(response).to have_http_status(:created)
      body = response.parsed_body["cv_import"]
      expect(body).to include("status" => "pending", "filename" => "cv.pdf")
      expect(body).not_to have_key("source_data")
      expect(CvImport.last.media_type).to eq("application/pdf")
    end

    it "rejects a file that isn't a PDF or Word document" do
      post "/api/v1/cv_imports", params: { file: upload("hello", "cv.txt", "text/plain") }, headers: headers

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body["error"]).to eq("Upload a PDF or Word (.docx) file.")
    end

    it "rejects a file over 5 MB" do
      big = upload("%PDF-1.4\n" + ("a" * 5.megabytes), "cv.pdf", "application/pdf")

      post "/api/v1/cv_imports", params: { file: big }, headers: headers

      expect(response).to have_http_status(:bad_request)
      expect(response.parsed_body["error"]).to eq("That file is over 5 MB.")
    end

    it "limits imports per day" do
      create_list(:cv_import, CvImport::DAILY_LIMIT, user: user)

      post "/api/v1/cv_imports", params: { file: pdf }, headers: headers

      expect(response).to have_http_status(:too_many_requests)
    end

    it "reports when CV import isn't set up" do
      allow(CvImports::Extractor).to receive(:configured?).and_return(false)

      post "/api/v1/cv_imports", params: { file: pdf }, headers: headers

      expect(response).to have_http_status(:service_unavailable)
      expect(response.parsed_body["error"]).to eq("CV import isn't available right now.")
    end

    it "requires authentication" do
      post "/api/v1/cv_imports", params: { file: pdf }

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "GET /api/v1/cv_imports/:id" do
    it "returns the import without the file" do
      cv_import = create(:cv_import, user: user)

      get "/api/v1/cv_imports/#{cv_import.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["cv_import"]).to include("id" => cv_import.id, "status" => "pending")
      expect(response.parsed_body["cv_import"]).not_to have_key("source_data")
    end

    it "forbids another user's import" do
      get "/api/v1/cv_imports/#{create(:cv_import).id}", headers: headers

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /api/v1/cv_imports/:id/apply" do
    let(:draft) do
      CvImports::Draft.from_model_output(
        "header" => {
          "name" => "Imported Name", "headline" => "Backend engineer", "location" => "Lisbon",
          "links" => [ { "label" => "Site", "url" => "https://alex.example.com" }, { "label" => "GitHub", "url" => "https://github.com/alex" } ]
        },
        "sections" => [
          { "section_type" => "Experience", "title" => "Acme", "start_month" => "2022-03", "blocks" => [ { "kind" => "bullet", "text" => "Shipped" } ] },
          { "section_type" => "Education", "title" => "Uni" },
          { "section_type" => "Skills", "title" => "Skills" }
        ]
      ).as_json
    end
    let(:cv_import) { create(:cv_import, user: user, status: "succeeded", source_data: nil, result: draft) }

    def apply(params, import = cv_import)
      post "/api/v1/cv_imports/#{import.id}/apply", params: params, headers: headers, as: :json
    end

    it "adds only the chosen sections, in order" do
      apply(section_indexes: [ 2, 0, 7 ], fill_profile: false)

      expect(response).to have_http_status(:ok)
      expect(user.section_templates.order(:id).map(&:title)).to eq([ "Acme", "Skills" ])
      acme = user.section_templates.find_by(title: "Acme")
      expect(acme).to have_attributes(start_date: Date.new(2022, 3, 1), content: "<ul><li><p>Shipped</p></li></ul>")
      expect(response.parsed_body["section_templates"].size).to eq(2)
      expect(cv_import.reload.applied_at).to be_present
    end

    it "fills only empty profile fields and adds new links" do
      user.update_resume_profile!(
        name: "Kept Name", headline: "", email: "kept@example.com", phone: "", location: "",
        links: [ { label: "Site", url: "https://alex.example.com" } ]
      )

      apply(section_indexes: [], fill_profile: true)

      profile = response.parsed_body["profile"]
      expect(profile).to include("name" => "Kept Name", "headline" => "Backend engineer", "location" => "Lisbon", "email" => "kept@example.com")
      expect(profile["links"].map { |link| link["url"] }).to eq([ "https://alex.example.com", "https://github.com/alex" ])
    end

    it "leaves the profile alone when not asked" do
      apply(section_indexes: [ 0 ], fill_profile: false)

      expect(user.reload.resume_profile).to eq({})
    end

    it "can't be applied twice" do
      apply(section_indexes: [ 0 ], fill_profile: false)
      apply(section_indexes: [ 0 ], fill_profile: false)

      expect(response).to have_http_status(:unprocessable_content)
      expect(user.section_templates.count).to eq(1)
    end

    it "can't apply an import that hasn't been read" do
      apply({ section_indexes: [ 0 ], fill_profile: false }, create(:cv_import, user: user))

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "forbids another user's import" do
      other = create(:cv_import, status: "succeeded", source_data: nil, result: draft)

      apply({ section_indexes: [ 0 ], fill_profile: true }, other)

      expect(response).to have_http_status(:forbidden)
      expect(user.section_templates.count).to eq(0)
    end
  end
end
