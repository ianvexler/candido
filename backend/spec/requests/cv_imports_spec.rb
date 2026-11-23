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

    it "accepts a Word document" do
      buffer = Zip::OutputStream.write_buffer do |zip|
        zip.put_next_entry("[Content_Types].xml")
        zip.write('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        zip.put_next_entry("word/document.xml")
        zip.write('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>')
      end
      docx = upload(buffer.string, "cv.docx", CvImports::Extractor::DOCX)

      post "/api/v1/cv_imports", params: { file: docx }, headers: headers

      expect(response).to have_http_status(:created)
      expect(CvImport.last.media_type).to eq(CvImports::Extractor::DOCX)
    end

    it "fails imports left unfinished, and forgets their files" do
      stuck = create(:cv_import, user: user, status: "processing", updated_at: 11.minutes.ago)

      get "/api/v1/cv_imports/#{stuck.id}", headers: headers

      expect(response.parsed_body["cv_import"]).to include(
        "status" => "failed", "error_message" => "Something went wrong reading this CV. Try again later."
      )
      expect(stuck.reload.source_data).to be_nil
    end

    it "leaves imports that are still being read" do
      recent = create(:cv_import, user: user, status: "processing", updated_at: 2.minutes.ago)

      get "/api/v1/cv_imports/#{recent.id}", headers: headers

      expect(response.parsed_body["cv_import"]["status"]).to eq("processing")
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
          { "section_type" => "Experience", "entries" => [
            { "title" => "Acme", "start_month" => "2022-03", "blocks" => [ { "kind" => "bullet", "text" => "Shipped" } ] },
            { "title" => "Globex" }
          ] },
          { "section_type" => "Education", "entries" => [ { "title" => "Uni" } ] },
          { "section_type" => "Skills", "entries" => [ { "title" => "Skills" } ] }
        ]
      ).as_json
    end
    let(:cv_import) { create(:cv_import, user: user, status: "succeeded", source_data: nil, result: draft) }

    def entry_id(section, entry = 0)
      draft["sections"][section]["entries"][entry]["id"]
    end

    def apply(params, import = cv_import)
      post "/api/v1/cv_imports/#{import.id}/apply", params: params, headers: headers, as: :json
    end

    it "adds only the chosen entries, under their headings and in order" do
      apply(entry_ids: [ entry_id(2), entry_id(0, 0), "unknown" ], fill_profile: false)

      expect(response).to have_http_status(:ok)
      experience, skills = user.section_templates.order(:id).to_a
      expect([ experience, skills ].map(&:section_type)).to eq([ "Experience", "Skills" ])
      expect(experience.entries.size).to eq(1)
      expect(experience.entries.first).to include(
        "title" => "Acme", "start_date" => "2022-03-01", "content" => a_string_including("<p>Shipped</p></li></ul>")
      )
      expect(response.parsed_body["section_templates"].size).to eq(2)
      expect(cv_import.reload.applied_at).to be_present
    end

    it "keeps several entries in one section" do
      apply(entry_ids: [ entry_id(0, 0), entry_id(0, 1) ], fill_profile: false)

      expect(user.section_templates.sole.entries.pluck("title")).to eq([ "Acme", "Globex" ])
    end

    it "also makes a CV from the added sections when asked" do
      apply(entry_ids: [ entry_id(0), entry_id(2) ], fill_profile: false, create_cv: true)

      curriculum = user.curriculums.sole
      expect(response.parsed_body["curriculum_id"]).to eq(curriculum.id)
      expect(curriculum.title).to eq("My CV")
      expect(curriculum.curriculum_sections.map(&:section_type)).to eq([ "Experience", "Skills" ])
    end

    it "names a second CV apart from the first" do
      create(:curriculum, user: user, title: "My CV")

      apply(entry_ids: [ entry_id(0) ], fill_profile: false, create_cv: true)

      expect(user.curriculums.order(:id).last.title).to eq("My CV 2")
    end

    it "makes no CV when not asked, or when no section was added" do
      apply(entry_ids: [], fill_profile: true, create_cv: true)
      expect(response.parsed_body["curriculum_id"]).to be_nil

      other = create(:cv_import, user: user, status: "succeeded", source_data: nil, result: draft)
      apply({ entry_ids: [ entry_id(0) ], fill_profile: false }, other)

      expect(user.curriculums).to be_empty
    end

    it "fills only empty profile fields and adds new links" do
      user.update_resume_profile!(
        name: "Kept Name", headline: "", email: "kept@example.com", phone: "", location: "",
        links: [ { label: "Site", url: "https://alex.example.com" } ]
      )

      apply(entry_ids: [], fill_profile: true)

      profile = response.parsed_body["profile"]
      expect(profile).to include("name" => "Kept Name", "headline" => "Backend engineer", "location" => "Lisbon", "email" => "kept@example.com")
      expect(profile["links"].map { |link| link["url"] }).to eq([ "https://alex.example.com", "https://github.com/alex" ])
    end

    it "leaves the profile alone when not asked" do
      apply(entry_ids: [ entry_id(0) ], fill_profile: false)

      expect(user.reload.resume_profile).to eq({})
    end

    it "rejects ids that aren't text" do
      apply(entry_ids: [ 1 ], fill_profile: false)

      expect(response).to have_http_status(:bad_request)
      expect(user.section_templates.count).to eq(0)
      expect(cv_import.reload.applied_at).to be_nil
    end

    it "rejects ids that aren't a list" do
      apply(entry_ids: { "0" => "1" }, fill_profile: false)

      expect(response).to have_http_status(:bad_request)
    end

    it "can't be applied twice" do
      apply(entry_ids: [ entry_id(0) ], fill_profile: false)
      apply(entry_ids: [ entry_id(0) ], fill_profile: false)

      expect(response).to have_http_status(:unprocessable_content)
      expect(user.section_templates.count).to eq(1)
    end

    it "can't apply an import that hasn't been read" do
      apply({ entry_ids: [ entry_id(0) ], fill_profile: false }, create(:cv_import, user: user))

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "forbids another user's import" do
      other = create(:cv_import, status: "succeeded", source_data: nil, result: draft)

      apply({ entry_ids: [ entry_id(0) ], fill_profile: true }, other)

      expect(response).to have_http_status(:forbidden)
      expect(user.section_templates.count).to eq(0)
    end
  end
end
