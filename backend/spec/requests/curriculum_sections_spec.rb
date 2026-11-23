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
      expect(response.parsed_body["curriculum"]["sections"].map { |item| item["entries"].first["title"] }).to eq([ "Acme", "Skills" ])
    end

    it "adds an empty section of a type at the end" do
      post "/api/v1/curriculums/#{curriculum.id}/sections", params: { section_type: "Education" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      added = response.parsed_body["curriculum"]["sections"].last
      expect(added).to include("section_type" => "Education", "hidden" => false)
      expect(added["entries"].sole).to include("title" => "", "content" => "")
      expect(curriculum.curriculum_sections.order(:position).last.section_template_id).to be_nil
    end

    it "rejects a request with neither library sections nor a section type" do
      post "/api/v1/curriculums/#{curriculum.id}/sections", params: { section_type: " " }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
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
        params: { entries: [ section.entries.first.merge("content" => "<p>Tailored</p>") ], hidden: true },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section"]).to include("hidden" => true)
      expect(response.parsed_body["section"]["entries"].sole).to include(
        "id" => section.entries.first["id"], "content" => a_string_including(">Tailored</p>")
      )
      expect(without_item_ids(template.reload.entries.first["content"])).to eq("<p>Original</p>")
    end

    it "keeps an unticked item unticked when the content is saved without ids" do
      section.update!(entries: [ { id: "one", content: '<p data-cv-item="a">A</p><p data-cv-item="b" data-cv-off="true">B</p>' } ])

      put "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}",
        params: { entries: [ { id: "new", content: "<p>B</p>" }, { id: "one", content: "<p>New</p><p>A</p><p>B</p>" } ] },
        headers: headers,
        as: :json

      expect(response).to have_http_status(:ok)
      added, saved = section.reload.entries.map { |entry| CvItems.list(entry["content"]) }
      expect(saved.last(2).map { |item| item.values_at(:id, :off) }).to eq([ [ "a", false ], [ "b", true ] ])
      expect(added.sole).to include(off: false)
    end

    it "keeps the first of two entries sent with the same id, with its ticks" do
      section.update!(entries: [ { id: "one", content: '<p data-cv-item="a" data-cv-off="true">A</p>' } ])

      section.update!(entries: [ { id: "one", content: "<p>A</p>" }, { id: "one", content: "<p>A</p>" } ])

      first, second = section.entries.map { |entry| CvItems.list(entry["content"]).sole }
      expect(first).to include(id: "a", off: true)
      expect(second).to include(off: false)
      expect(second[:id]).not_to eq("a")
    end

    it "replaces an item id over 64 characters" do
      long = "a" * 65

      put "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}",
        params: { entries: [ { content: "<p data-cv-item=\"#{long}\">A</p><p data-cv-item=\"#{'b' * 64}\">B</p>" } ] },
        headers: headers,
        as: :json

      ids = CvItems.list(section.reload.entries.sole["content"]).pluck(:id)
      expect(ids.first).to match(SectionContent::ENTRY_ID)
      expect(ids.last).to eq("b" * 64)
    end

    it "drops a trailing empty paragraph that carries an item id" do
      section.update!(entries: [ { content: '<p data-cv-item="a">A</p><p data-cv-item="b"></p>' } ])

      expect(section.entries.sole["content"]).to eq('<p data-cv-item="a">A</p>')
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
        params: { section_type: "Wrong CV" },
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
      expect(response.parsed_body["curriculum"]["sections"].map { |item| item["entries"].first["title"] }).to eq([ "Skills", "Acme" ])
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
        template.update!(entries: [ template.entries.first.merge("content" => "<p>Improved</p>", "role" => "Lead engineer") ])
      end

      get "/api/v1/curriculums/#{curriculum.id}", headers: headers
      expect(response.parsed_body["curriculum"]["sections"].first["library_updated"]).to be(true)

      travel 2.minutes do
        post "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}/sync", headers: headers
      end

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section"]).to include("library_updated" => false)
      expect(response.parsed_body["section"]["entries"].sole).to include("content" => a_string_including(">Improved</p>"), "role" => "Lead engineer")
    end

    it "still leaves out the entries this resume left out" do
      template.update!(entries: [ { id: "one", title: "One" }, { id: "two", title: "Two" } ])
      section.update!(entries: [ { id: "one", title: "One" }, { id: "two", title: "Two", hidden: true } ])
      template.update!(entries: [ { id: "two", title: "Two, improved" }, { id: "three", title: "Three" } ])

      post "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}/sync", headers: headers

      expect(section.reload.entries.map { |entry| entry.values_at("title", "hidden") })
        .to eq([ [ "Two, improved", true ], [ "Three", false ] ])
      expect(template.reload.entries.pluck("hidden")).to eq([ false, false ])
    end

    it "keeps this resume's placement when pulling the library version" do
      section.update!(placement: "sidebar")
      travel(1.minute) { template.update!(entries: [ { content: "<p>Improved</p>" } ]) }

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
