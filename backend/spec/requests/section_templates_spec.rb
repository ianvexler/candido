require "rails_helper"

RSpec.describe "Section templates" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  describe "GET /api/v1/section_templates" do
    it "returns the current user's templates oldest first, with content" do
      create(:section_template, user: user, title: "First", content: "<ul><li><p>Led a team</p></li></ul>")
      create(:section_template, user: user, title: "Second")
      create(:section_template, title: "Other user")

      get "/api/v1/section_templates", headers: headers

      expect(response).to have_http_status(:ok)
      templates = response.parsed_body["section_templates"]
      expect(templates.map { |item| item["title"] }).to eq([ "First", "Second" ])
      expect(templates.first["content"]).to eq("<ul><li><p>Led a team</p></li></ul>")
    end

    it "requires authentication" do
      get "/api/v1/section_templates"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /api/v1/section_templates" do
    it "creates a template with content" do
      post "/api/v1/section_templates",
        params: {
          title: "Skills",
          section_type: "Skills",
          description: "Core stack",
          content: "<p>Ruby</p>"
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["section_template"]
      expect(body).to include(
        "title" => "Skills", "section_type" => "Skills", "user_id" => user.id, "content" => "<p>Ruby</p>"
      )
    end

    it "defaults content to empty" do
      post "/api/v1/section_templates", params: { title: "Blank", section_type: "Section" }, headers: headers, as: :json

      expect(response.parsed_body["section_template"]["content"]).to eq("")
    end
  end

  describe "PUT /api/v1/section_templates/:id" do
    it "updates an owned template" do
      template = create(:section_template, user: user, title: "Old")

      put "/api/v1/section_templates/#{template.id}",
        params: { title: "New" },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section_template"]["title"]).to eq("New")
      expect(template.reload.title).to eq("New")
    end

    it "keeps hidden spans and formatting in content" do
      template = create(:section_template, user: user)
      html = '<h3>Impact</h3><ul><li><p><strong>Shipped</strong> Rails <span data-cv-hidden="true">at night</span></p></li></ul>'

      put "/api/v1/section_templates/#{template.id}", params: { content: html }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(template.reload.content).to eq(html)
    end

    it "strips scripts and event handlers from content" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}",
        params: { content: '<p onclick="alert(1)">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a>' },
        headers: headers,
        as: :json

      content = template.reload.content
      expect(content).to include("<p>Hi")
      expect(content).not_to include("script", "onclick", "javascript:")
    end

    it "stores whitespace-only content as empty" do
      template = create(:section_template, user: user, content: "<p>Old</p>")

      put "/api/v1/section_templates/#{template.id}", params: { content: "<p> &nbsp; </p>" }, headers: headers, as: :json

      expect(template.reload.content).to eq("")
    end

    it "drops the empty paragraph the editor keeps after a trailing list" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}",
        params: { content: "<ul><li><p>Ruby</p></li></ul><p></p>" },
        headers: headers,
        as: :json

      expect(template.reload.content).to eq("<ul><li><p>Ruby</p></li></ul>")
    end

    it "saves role, organization, location and a month range" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}",
        params: {
          role: " Senior  engineer ", organization: "Acme", location: "",
          start_date: "2022-03-17", end_date: "2024-01-05"
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section_template"]).to include(
        "role" => "Senior engineer", "organization" => "Acme", "location" => nil,
        "start_date" => "2022-03-01", "end_date" => "2024-01-01", "current" => false
      )
    end

    it "drops the end date for a current role" do
      template = create(:section_template, user: user, start_date: "2022-03-01", end_date: "2023-01-01")

      put "/api/v1/section_templates/#{template.id}", params: { current: true }, headers: headers, as: :json

      expect(template.reload).to have_attributes(current: true, end_date: nil)
    end

    it "rejects an end date before the start date" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}",
        params: { start_date: "2024-01-01", end_date: "2023-01-01" },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to match(/before the start date/)
    end

    it "forbids another user's template" do
      template = create(:section_template)

      put "/api/v1/section_templates/#{template.id}",
        params: { title: "Hijack" },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "DELETE /api/v1/section_templates/:id" do
    it "deletes an owned template" do
      template = create(:section_template, user: user)

      delete "/api/v1/section_templates/#{template.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(SectionTemplate.find_by(id: template.id)).to be_nil
    end
  end
end
