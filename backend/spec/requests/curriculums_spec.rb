require "rails_helper"

RSpec.describe "Curriculums" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  describe "GET /api/v1/curriculums" do
    it "lists the current user's CVs with section counts" do
      curriculum = create(:curriculum, user: user, title: "Mine")
      curriculum.import_section_templates!(create(:section_template, user: user))
      create(:curriculum, title: "Someone else's")

      get "/api/v1/curriculums", headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["curriculums"].map { |item| item.slice("title", "section_count") })
        .to eq([ { "title" => "Mine", "section_count" => 1 } ])
    end

    it "requires authentication" do
      get "/api/v1/curriculums"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /api/v1/curriculums" do
    it "creates a CV and imports the chosen library sections in order" do
      first = create(:section_template, user: user, title: "Experience", content: "<p>Acme</p>")
      second = create(:section_template, user: user, title: "Skills")

      post "/api/v1/curriculums",
        params: { title: "Platform roles", section_template_ids: [ second.id, first.id ] },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["curriculum"]
      expect(body).to include("title" => "Platform roles", "layout" => "single_column")
      expect(body["sections"].map { |section| section.slice("title", "position", "section_template_id") }).to eq([
        { "title" => "Skills", "position" => 0, "section_template_id" => second.id },
        { "title" => "Experience", "position" => 1, "section_template_id" => first.id }
      ])
      expect(body["sections"].last).to include("content" => "<p>Acme</p>", "library_updated" => false)
    end

    it "rejects another user's library section and creates nothing" do
      foreign = create(:section_template)

      expect {
        post "/api/v1/curriculums",
          params: { title: "Sneaky", section_template_ids: [ foreign.id ] },
          headers: headers,
          as: :json
      }.not_to change(Curriculum, :count)

      expect(response).to have_http_status(:not_found)
    end

    it "requires a title" do
      post "/api/v1/curriculums", params: { title: "" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "GET /api/v1/curriculums/:id" do
    it "forbids another user's CV" do
      get "/api/v1/curriculums/#{create(:curriculum).id}", headers: headers

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PUT /api/v1/curriculums/:id" do
    it "updates title and layout" do
      curriculum = create(:curriculum, user: user)

      put "/api/v1/curriculums/#{curriculum.id}",
        params: { title: "Renamed", layout: "two_column" },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(curriculum.reload).to have_attributes(title: "Renamed", layout: "two_column")
    end
  end

  describe "DELETE /api/v1/curriculums/:id" do
    it "deletes the CV but leaves the library alone" do
      template = create(:section_template, user: user)
      curriculum = create(:curriculum, user: user)
      curriculum.import_section_templates!(template)

      delete "/api/v1/curriculums/#{curriculum.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(Curriculum.find_by(id: curriculum.id)).to be_nil
      expect(SectionTemplate.find_by(id: template.id)).to be_present
    end
  end
end

RSpec.describe "Curriculum headers" do
  let(:user) { create(:user, name: "Ada Lovelace", email: "ada@example.com") }
  let(:headers) { auth_headers(user) }
  let(:curriculum) { create(:curriculum, user: user) }

  before do
    user.update_resume_profile!(
      name: "Ada Lovelace", headline: "Engineer", email: "ada@example.com",
      phone: "", location: "London", links: [ { label: "GitHub", url: "https://github.com/ada" } ]
    )
  end

  it "shows the profile when the resume overrides nothing" do
    get "/api/v1/curriculums/#{curriculum.id}", headers: headers

    body = response.parsed_body["curriculum"]
    expect(body["header"]).to eq({})
    expect(body["resolved_header"]).to include("headline" => "Engineer", "location" => "London")
  end

  it "stores only overridden fields and layers them on the profile" do
    put "/api/v1/curriculums/#{curriculum.id}",
      params: { header: { headline: "Backend engineer", location: "  ", links: [] } },
      headers: headers,
      as: :json

    expect(response).to have_http_status(:ok)
    body = response.parsed_body["curriculum"]
    expect(body["header"]).to eq("headline" => "Backend engineer", "links" => [])
    expect(body["resolved_header"]).to include(
      "name" => "Ada Lovelace", "headline" => "Backend engineer", "location" => "London", "links" => []
    )
  end

  it "clears overrides when sent an empty header" do
    curriculum.update_header!(headline: "Old override")

    put "/api/v1/curriculums/#{curriculum.id}", params: { header: {} }, headers: headers, as: :json

    expect(curriculum.reload.header).to eq({})
  end

  it "leaves overrides alone when header isn't sent" do
    curriculum.update_header!(headline: "Keep me")

    put "/api/v1/curriculums/#{curriculum.id}", params: { title: "Renamed" }, headers: headers, as: :json

    expect(curriculum.reload.header).to eq("headline" => "Keep me")
  end
end

RSpec.describe "Curriculum paper size" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  it "stores the paper size" do
    curriculum = create(:curriculum, user: user)

    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { paper: "letter" } }, headers: headers, as: :json

    expect(response).to have_http_status(:ok)
    expect(curriculum.reload.styles["paper"]).to eq("letter")
    expect(response.parsed_body["curriculum"]["styles"]).to include("paper" => "letter")
  end

  it "keeps other style settings when the paper changes" do
    curriculum = create(:curriculum, user: user, styles: { "accent" => "x" })

    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { paper: "a4" } }, headers: headers, as: :json

    expect(curriculum.reload.styles).to eq("accent" => "x", "paper" => "a4")
  end

  it "rejects an unknown paper size" do
    curriculum = create(:curriculum, user: user)

    put "/api/v1/curriculums/#{curriculum.id}", params: { styles: { paper: "a3" } }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
    expect(response.parsed_body["error"]).to match(/Paper/)
    expect(curriculum.reload.styles).to eq({})
  end
end
