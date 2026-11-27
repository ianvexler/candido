require "rails_helper"

RSpec.describe "CV labels" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }
  let(:label) { create(:cv_label, user: user, name: "Backend") }
  let(:template) do
    create(:section_template, user: user, entries: [ { id: "job", content: '<p data-cv-item="a">A</p><p data-cv-item="b">B</p>' } ])
  end

  def label_items(label, targets, on: true, as: headers)
    put "/api/v1/cv_labels/#{label.id}/items", params: { on: on, targets: targets }, headers: as, as: :json
  end

  describe "labels" do
    it "creates, renames and lists them in name order" do
      post "/api/v1/cv_labels", params: { name: "  Writing " }, headers: headers, as: :json
      expect(response.parsed_body["cv_label"]).to include("name" => "Writing")
      id = response.parsed_body["cv_label"]["id"]
      label

      put "/api/v1/cv_labels/#{id}", params: { name: "data" }, headers: headers, as: :json
      expect(response.parsed_body["cv_label"]).to include("id" => id, "name" => "data")

      get "/api/v1/cv_labels", headers: headers
      expect(response.parsed_body["cv_labels"].pluck("name")).to eq([ "Backend", "data" ])
    end

    it "refuses a name already taken, ignoring case" do
      label

      post "/api/v1/cv_labels", params: { name: "backend" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(response.parsed_body["error"]).to eq("You already have a purpose called backend")
    end

    it "refuses a blank or long name" do
      post "/api/v1/cv_labels", params: { name: "  " }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      post "/api/v1/cv_labels", params: { name: "x" * 41 }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "lets another user use the same name" do
      create(:cv_label, name: "Backend")

      post "/api/v1/cv_labels", params: { name: "Backend" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
    end

    it "forbids another user's label" do
      other = create(:cv_label)

      put "/api/v1/cv_labels/#{other.id}", params: { name: "Mine" }, headers: headers, as: :json
      expect(response).to have_http_status(:forbidden)

      delete "/api/v1/cv_labels/#{other.id}", headers: headers
      expect(response).to have_http_status(:forbidden)

      label_items(other, [ { section_template_id: template.id, id: "a" } ])
      expect(response).to have_http_status(:forbidden)
      expect(CvLabel.exists?(other.id)).to be(true)
    end

    it "requires authentication" do
      get "/api/v1/cv_labels"

      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "PUT /api/v1/cv_labels/:id/items" do
    it "adds the label once, however often it is sent, and removes it" do
      label_items(label, [ { section_template_id: template.id, id: "a" }, { section_template_id: template.id, id: "a" }, { section_template_id: template.id, id: "job" } ])

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["section_templates"].sole["item_labels"]).to eq("a" => [ label.id ], "job" => [ label.id ])

      label_items(label, [ { section_template_id: template.id, id: "a" } ], on: false)

      expect(template.reload.item_labels).to eq("job" => [ label.id ])
    end

    it "keeps other labels on the item" do
      other = create(:cv_label, user: user)
      label_items(other, [ { section_template_id: template.id, id: "a" } ])

      label_items(label, [ { section_template_id: template.id, id: "a" } ])

      expect(template.reload.item_labels["a"]).to contain_exactly(label.id, other.id)
    end

    it "leaves the section's edit times alone" do
      before = template.reload.slice(:updated_at, :item_added_at)

      travel(1.hour) do
        label_items(label, [ { section_template_id: template.id, id: "a" } ])
        label_items(label, [ { section_template_id: template.id, id: "b" } ], on: false)
      end

      expect(template.reload.slice(:updated_at, :item_added_at)).to eq(before)
    end

    it "changes nothing when an id isn't in its section" do
      second = create(:section_template, user: user, entries: [ { id: "two", content: '<p data-cv-item="c">C</p>' } ])

      label_items(label, [ { section_template_id: template.id, id: "a" }, { section_template_id: second.id, id: "a" } ])

      expect(response).to have_http_status(:unprocessable_content)
      expect(template.reload.item_labels).to eq({})
      expect(second.reload.item_labels).to eq({})
    end

    it "doesn't label a summary" do
      label_items(label, [ { section_template_id: template.id, id: "$summary" } ])

      expect(response).to have_http_status(:unprocessable_content)
      expect(template.reload.item_labels).to eq({})
    end

    it "doesn't reach another user's section" do
      other = create(:section_template)

      label_items(label, [ { section_template_id: other.id, id: other.entries.first["id"] } ])

      expect(response).to have_http_status(:not_found)
      expect(other.reload.item_labels).to eq({})
    end

    it "writes nothing when the label is deleted once it was loaded" do
      allow(CvLabel).to receive(:find_owned!).and_wrap_original do |find, *args|
        find.call(*args).tap { |found| CvLabel.where(id: found.id).delete_all }
      end

      label_items(label, [ { section_template_id: template.id, id: "a" } ])

      expect(response).to have_http_status(:not_found)
      expect(template.reload.item_labels).to eq({})
    end

    it "returns each touched section once" do
      second = create(:section_template, user: user, entries: [ { id: "two" } ])

      label_items(label, [ { section_template_id: template.id, id: "a" }, { section_template_id: second.id, id: "two" }, { section_template_id: template.id, id: "b" } ])

      expect(response.parsed_body["section_templates"].pluck("id")).to contain_exactly(template.id, second.id)
    end
  end

  describe "DELETE /api/v1/cv_labels/:id" do
    it "removes the label from every section, dropping keys left empty" do
      other = create(:cv_label, user: user)
      second = create(:section_template, user: user, entries: [ { id: "two", content: '<p data-cv-item="c">C</p>' } ])
      label_items(label, [ { section_template_id: template.id, id: "a" }, { section_template_id: second.id, id: "c" } ])
      label_items(other, [ { section_template_id: template.id, id: "a" } ])
      updated = template.reload.updated_at

      delete "/api/v1/cv_labels/#{label.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(template.reload.item_labels).to eq("a" => [ other.id ])
      expect(template.updated_at).to eq(updated)
      expect(second.reload.item_labels).to eq({})
    end

    it "makes CVs that used it Everything and leaves their text alone" do
      curriculum = create(:curriculum, user: user, cv_label: label)
      section = curriculum.curriculum_sections.create!(section_type: "Experience", position: 0, entries: template.entries)
      entries = CurriculumSection.where(id: section.id).pick(Arel.sql("entries::text"))

      delete "/api/v1/cv_labels/#{label.id}", headers: headers

      expect(curriculum.reload.cv_label_id).to be_nil
      expect(CurriculumSection.where(id: section.id).pick(Arel.sql("entries::text"))).to eq(entries)
    end
  end
end
