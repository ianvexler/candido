require "rails_helper"

RSpec.describe "Resume designs" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  it "saves, lists, renames and deletes the user's designs" do
    post "/api/v1/resume_designs", params: { name: "Corporate", settings: { font: "source_serif", size: "small" } }, headers: headers, as: :json
    expect(response).to have_http_status(:created)
    id = response.parsed_body["resume_design"]["id"]
    create(:resume_design, name: "Someone else's")

    get "/api/v1/resume_designs", headers: headers
    expect(response.parsed_body["resume_designs"].map { |design| design["name"] }).to eq([ "Corporate" ])
    expect(response.parsed_body["resume_designs"].first["settings"]).to eq("font" => "source_serif", "size" => "small")

    put "/api/v1/resume_designs/#{id}", params: { name: "Corporate (serif)" }, headers: headers, as: :json
    expect(response.parsed_body["resume_design"]["name"]).to eq("Corporate (serif)")

    delete "/api/v1/resume_designs/#{id}", headers: headers
    expect(response).to have_http_status(:ok)
    expect(user.resume_designs.count).to eq(0)
  end

  it "rejects invalid settings and names" do
    post "/api/v1/resume_designs", params: { name: "Bad", settings: { font: "comic_sans" } }, headers: headers, as: :json
    expect(response).to have_http_status(:unprocessable_content)

    post "/api/v1/resume_designs", params: { name: "", settings: {} }, headers: headers, as: :json
    expect(response).to have_http_status(:unprocessable_content)
  end

  it "limits how many designs a user keeps" do
    create_list(:resume_design, ResumeDesign::MAX_PER_USER, user: user)

    post "/api/v1/resume_designs", params: { name: "One more", settings: {} }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
  end

  it "keeps at most one default" do
    first = create(:resume_design, user: user, is_default: true)
    second = create(:resume_design, user: user)

    put "/api/v1/resume_designs/#{second.id}", params: { is_default: true }, headers: headers, as: :json

    expect(first.reload.is_default).to be(false)
    expect(second.reload.is_default).to be(true)
  end

  it "leaves no default once the default is deleted" do
    design = create(:resume_design, user: user, is_default: true)

    delete "/api/v1/resume_designs/#{design.id}", headers: headers

    expect(user.resume_designs.where(is_default: true)).to be_empty
  end

  it "forbids another user's design" do
    put "/api/v1/resume_designs/#{create(:resume_design).id}", params: { name: "Mine now" }, headers: headers, as: :json

    expect(response).to have_http_status(:forbidden)
  end

  describe "new resumes" do
    it "start with the default design" do
      create(:resume_design, user: user, is_default: true, settings: { "font" => "lora", "spacing" => "compact" })

      post "/api/v1/curriculums", params: { title: "Fresh" }, headers: headers, as: :json

      expect(response.parsed_body["curriculum"]["styles"]).to eq("font" => "lora", "spacing" => "compact")
    end

    it "start plain without a default" do
      create(:resume_design, user: user)

      post "/api/v1/curriculums", params: { title: "Fresh" }, headers: headers, as: :json

      expect(response.parsed_body["curriculum"]["styles"]).to eq({})
    end
  end

  it "doesn't change resumes when a saved design is edited later" do
    design = create(:resume_design, user: user, is_default: true, settings: { "font" => "lora" })
    post "/api/v1/curriculums", params: { title: "Fresh" }, headers: headers, as: :json
    curriculum = Curriculum.find(response.parsed_body["curriculum"]["id"])

    put "/api/v1/resume_designs/#{design.id}", params: { settings: { font: "plex_sans" } }, headers: headers, as: :json

    expect(curriculum.reload.styles).to eq("font" => "lora")
  end
end
