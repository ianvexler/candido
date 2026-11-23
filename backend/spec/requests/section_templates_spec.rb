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
      expect(templates.map { |item| item["entries"].first["title"] }).to eq([ "First", "Second" ])
      expect(without_item_ids(templates.first["entries"].first["content"])).to eq("<ul><li><p>Led a team</p></li></ul>")
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
          section_type: "Skills",
          entries: [ { description: "Core stack", content: "<p>Ruby</p>" } ]
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["section_template"]
      expect(body).to include("section_type" => "Skills", "user_id" => user.id)
      expect(body["entries"].sole).to include("title" => "", "description" => "Core stack", "content" => match(%r{\A<p data-cv-item="[\w-]+">Ruby</p>\z}))
    end

    it "starts with one empty entry" do
      post "/api/v1/section_templates", params: { section_type: "Section" }, headers: headers, as: :json

      expect(response.parsed_body["section_template"]["entries"].sole).to include("id" => be_present, "content" => "")
    end
  end

  describe "PUT /api/v1/section_templates/:id" do
    it "updates an owned template" do
      template = create(:section_template, user: user, title: "Old")

      put "/api/v1/section_templates/#{template.id}",
        params: { section_type: "New" },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section_template"]["section_type"]).to eq("New")
      expect(template.reload.section_type).to eq("New")
    end

    it "keeps hidden spans and formatting in content" do
      template = create(:section_template, user: user)
      html = '<h3>Impact</h3><ul><li><p><strong>Shipped</strong> Rails <span data-cv-hidden="true">at night</span></p></li></ul>'

      put "/api/v1/section_templates/#{template.id}", params: { entries: [ { content: html } ] }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(without_item_ids(template.reload.entries.first["content"])).to eq(html)
    end

    it "keeps item ids but not ticks" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}",
        params: { entries: [ { content: '<p data-cv-item="a" data-cv-off="true">A</p>' } ] },
        headers: headers,
        as: :json

      expect(template.reload.entries.first["content"]).to eq('<p data-cv-item="a">A</p>')
    end

    it "strips scripts and event handlers from content" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}",
        params: { entries: [ { content: '<p onclick="alert(1)">Hi<script>alert(1)</script></p><a href="javascript:alert(1)">x</a>' } ] },
        headers: headers,
        as: :json

      content = template.reload.entries.first["content"]
      expect(without_item_ids(content)).to include("<p>Hi")
      expect(content).not_to include("script", "onclick", "javascript:")
    end

    it "stores whitespace-only content as empty" do
      template = create(:section_template, user: user, content: "<p>Old</p>")

      put "/api/v1/section_templates/#{template.id}", params: { entries: [ { content: "<p> &nbsp; </p>" } ] }, headers: headers, as: :json

      expect(template.reload.entries.first["content"]).to eq("")
    end

    it "drops the empty paragraph the editor keeps after a trailing list" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}",
        params: { entries: [ { content: "<ul><li><p>Ruby</p></li></ul><p></p>" } ] },
        headers: headers,
        as: :json

      expect(without_item_ids(template.reload.entries.first["content"])).to eq("<ul><li><p>Ruby</p></li></ul>")
    end

    it "saves role, organization, location and a month range" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}",
        params: {
          entries: [ {
            role: " Senior  engineer ", organization: "Acme", location: "",
            start_date: "2022-03-17", end_date: "2024-01-05"
          } ]
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section_template"]["entries"].sole).to include(
        "role" => "Senior engineer", "organization" => "Acme", "location" => nil,
        "start_date" => "2022-03-01", "end_date" => "2024-01-01", "current" => false
      )
    end

    it "drops the end date for a current role" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}", params: { entries: [ { start_date: "2022-03-01", end_date: "2023-01-01", current: true } ] }, headers: headers, as: :json

      expect(template.reload.entries.first).to include("current" => true, "end_date" => nil)
    end

    it "rejects an end date before the start date" do
      template = create(:section_template, user: user)

      put "/api/v1/section_templates/#{template.id}",
        params: { entries: [ { start_date: "2024-01-01", end_date: "2023-01-01" } ] },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to match(/before the start date/)
    end

    it "keeps entries in order and gives each its own id" do
      template = create(:section_template, user: user)
      entries = [ { id: "one", title: "One" }, { id: "one", title: "Copy" }, { id: "<b>", title: "Odd" } ]

      put "/api/v1/section_templates/#{template.id}", params: { entries: entries }, headers: headers, as: :json

      saved = template.reload.entries
      expect(saved.pluck("title")).to eq([ "One", "Copy", "Odd" ])
      expect(saved.pluck("id").uniq.size).to eq(3)
      expect(saved.first["id"]).to eq("one")
    end

    it "doesn't touch a section saved without changes" do
      template = create(:section_template, user: user)

      expect {
        travel(1.minute) do
          put "/api/v1/section_templates/#{template.id}", params: { entries: template.entries }, headers: headers, as: :json
        end
      }.not_to(change { template.reload.updated_at })
    end

    it "forbids another user's template" do
      template = create(:section_template)

      put "/api/v1/section_templates/#{template.id}",
        params: { section_type: "Hijack" },
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
