require "rails_helper"

RSpec.describe "Section templates" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }

  describe "GET /api/v1/section_templates" do
    it "returns the current user's templates with items" do
      template = create(:section_template, user: user, title: "Acme")
      create(:section_template_item, section_template: template, body: "Led a team", position: 0)
      create(:section_template, title: "Other user")

      get "/api/v1/section_templates", headers: headers

      expect(response).to have_http_status(:ok)
      titles = response.parsed_body["section_templates"].map { |item| item["title"] }
      expect(titles).to eq([ "Acme" ])
      expect(response.parsed_body["section_templates"].first["items"].map { |item| item["body"] })
        .to eq([ "Led a team" ])
    end

    it "requires authentication" do
      get "/api/v1/section_templates"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /api/v1/section_templates" do
    it "creates a template with items" do
      post "/api/v1/section_templates",
        params: {
          title: "Skills",
          section_type: "Skills",
          description: "Core stack",
          items: [
            { kind: "bullet", body: "Ruby" },
            { kind: "bullet", body: "  " },
            { kind: "paragraph", body: "Comfortable with Rails" }
          ]
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      body = response.parsed_body["section_template"]
      expect(body).to include("title" => "Skills", "section_type" => "Skills", "user_id" => user.id)
      expect(body["items"].map { |item| item["body"] }).to eq([ "Ruby", "Comfortable with Rails" ])
      expect(body["items"].map { |item| item["kind"] }).to eq([ "bullet", "paragraph" ])
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

    it "replaces items when items are provided" do
      template = create(:section_template, user: user)
      create(:section_template_item, section_template: template, body: "Old")

      put "/api/v1/section_templates/#{template.id}",
        params: {
          items: [
            { kind: "heading", body: "Impact" },
            { kind: "bullet", body: "Shipped Rails", hidden: true }
          ]
        },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      bodies = response.parsed_body["section_template"]["items"].map { |item| item.slice("kind", "body", "hidden") }
      expect(bodies).to eq([
        { "kind" => "heading", "body" => "Impact", "hidden" => false },
        { "kind" => "bullet", "body" => "Shipped Rails", "hidden" => true }
      ])
      expect(template.section_template_items.count).to eq(2)
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

  describe "POST /api/v1/section_templates/:section_template_id/items" do
    it "adds an item to an owned template" do
      template = create(:section_template, user: user)

      post "/api/v1/section_templates/#{template.id}/items",
        params: { kind: "heading", body: "Impact" },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["item"]).to include("kind" => "heading", "body" => "Impact", "position" => 0)
    end
  end

  describe "PUT /api/v1/section_templates/:section_template_id/items/:id" do
    it "updates an owned item" do
      template = create(:section_template, user: user)
      item = create(:section_template_item, section_template: template, hidden: false)

      put "/api/v1/section_templates/#{template.id}/items/#{item.id}",
        params: { hidden: true, body: "Updated" },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["item"]).to include("hidden" => true, "body" => "Updated")
      expect(item.reload).to have_attributes(hidden: true, body: "Updated")
    end
  end

  describe "DELETE /api/v1/section_templates/:section_template_id/items/:id" do
    it "deletes an owned item" do
      template = create(:section_template, user: user)
      item = create(:section_template_item, section_template: template)

      delete "/api/v1/section_templates/#{template.id}/items/#{item.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(SectionTemplateItem.find_by(id: item.id)).to be_nil
    end
  end
end
