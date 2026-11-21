require "rails_helper"

RSpec.describe "Curriculum sections" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }
  let(:curriculum) { create(:curriculum, user: user) }
  let(:template) { create(:section_template, user: user, title: "Acme", content: "<p>Original</p>") }
  let!(:section) { curriculum.import_section_templates!(template).first }

  describe "POST /api/v1/curriculums/:curriculum_id/sections" do
    it "appends library sections to the end" do
      extra = create(:section_template, user: user, title: "Skills")

      post "/api/v1/curriculums/#{curriculum.id}/sections",
        params: { section_template_ids: [ extra.id ] },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["curriculum"]["sections"].map { |item| item["title"] }).to eq([ "Acme", "Skills" ])
    end

    it "forbids importing into another user's CV" do
      other = create(:curriculum)

      post "/api/v1/curriculums/#{other.id}/sections",
        params: { section_template_ids: [ template.id ] },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PUT /api/v1/curriculums/:curriculum_id/sections/:id" do
    it "edits the CV copy without touching the library" do
      put "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}",
        params: { content: "<p>Tailored</p>", hidden: true },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section"]).to include("content" => "<p>Tailored</p>", "hidden" => true)
      expect(template.reload.content).to eq("<p>Original</p>")
    end

    it "places the section in the sidebar or main column of this resume" do
      put "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}", params: { placement: "sidebar" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section"]).to include("placement" => "sidebar")
      expect(section.reload.placement).to eq("sidebar")
    end

    it "goes back to the automatic placement when cleared" do
      section.update!(placement: "main")

      put "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}", params: { placement: "" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(section.reload.placement).to be_nil
    end

    it "rejects an unknown placement" do
      put "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}", params: { placement: "footer" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(section.reload.placement).to be_nil
    end

    it "does not find a section from another CV" do
      other_section = create(:curriculum, user: user).import_section_templates!(template).first

      put "/api/v1/curriculums/#{curriculum.id}/sections/#{other_section.id}",
        params: { title: "Wrong CV" },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /api/v1/curriculums/:curriculum_id/sections/:id" do
    it "removes the section from the CV only" do
      delete "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(curriculum.curriculum_sections.reload).to be_empty
      expect(template.reload).to be_persisted
    end
  end

  describe "PUT /api/v1/curriculums/:curriculum_id/sections/order" do
    it "reorders sections" do
      second = curriculum.import_section_templates!(create(:section_template, user: user, title: "Skills")).first

      put "/api/v1/curriculums/#{curriculum.id}/sections/order",
        params: { section_ids: [ second.id, section.id ] },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["curriculum"]["sections"].map { |item| item["title"] }).to eq([ "Skills", "Acme" ])
    end

    it "rejects a list that doesn't match the CV's sections" do
      put "/api/v1/curriculums/#{curriculum.id}/sections/order",
        params: { section_ids: [ section.id, section.id ] },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "POST /api/v1/curriculums/:curriculum_id/sections/:id/sync" do
    it "flags library edits and pulls them in on request" do
      travel 1.minute do
        template.update!(content: "<p>Improved</p>", role: "Lead engineer")
      end

      get "/api/v1/curriculums/#{curriculum.id}", headers: headers
      expect(response.parsed_body["curriculum"]["sections"].first["library_updated"]).to be(true)

      travel 2.minutes do
        post "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}/sync", headers: headers
      end

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section"]).to include(
        "content" => "<p>Improved</p>", "role" => "Lead engineer", "library_updated" => false
      )
    end

    it "keeps this resume's placement when pulling the library version" do
      section.update!(placement: "sidebar")
      travel(1.minute) { template.update!(content: "<p>Improved</p>") }

      travel(2.minutes) { post "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}/sync", headers: headers }

      expect(section.reload.placement).to eq("sidebar")
    end

    it "explains when the library section was deleted" do
      template.destroy!

      post "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}/sync", headers: headers

      expect(response).to have_http_status(:unprocessable_content)
    end
  end
end
