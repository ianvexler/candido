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

    it "gives an item id used by an earlier entry a new ticked one" do
      off = '<p data-cv-item="a" data-cv-off="true">A</p>'
      section.update!(entries: [ { id: "one", content: off }, { id: "two", content: "<ul><li data-cv-item=\"b\">B</li></ul>#{off}" } ])

      first, second = section.reload.entries.map { |entry| CvItems.list(entry["content"]) }
      expect(first.sole).to include(id: "a", off: true)
      expect(second.first).to include(id: "b")
      expect(second.last).to include(text: "A", off: false)
      expect(second.last[:id]).not_to eq("a")
      expect { section.update!(entries: section.entries.deep_dup) }.not_to change { section.reload.entries }
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

  describe "POST /api/v1/curriculums/:curriculum_id/include" do
    let(:library) do
      create(:section_template, user: user, section_type: "Projects", entries: [
        { id: "one", title: "One", content: '<p data-cv-item="a">A</p>' },
        { id: "two", title: "Two", content: '<p data-cv-item="b">B</p><ol><li data-cv-item="c">C</li><li data-cv-item="d">D</li></ol>' },
        { id: "three", title: "Three", content: '<p data-cv-item="e">E</p>' }
      ])
    end

    def include_content(into: curriculum, **params)
      post "/api/v1/curriculums/#{into.id}/include",
        params: { section_template_id: library.id, **params }, headers: headers, as: :json
    end

    # Each entry as [id, hidden, its items], with unticked items in brackets.
    def ticks(section)
      section.reload.entries.map do |entry|
        items = CvItems.list(entry["content"]).map { |item| item[:off] ? "(#{item[:id]})" : item[:id] }
        [ entry["id"], entry["hidden"], items.join(" ") ]
      end
    end

    def copy_with(entries, **attributes)
      curriculum.import_section_templates!(library).sole.tap { |copy| copy.update!(entries: entries, **attributes) }
    end

    def copied = curriculum.curriculum_sections.order(:position).find_by!(section_template: library)

    it "appends the section, all ticked" do
      include_content

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["curriculum"]["sections"].pluck("section_template_id")).to eq([ template.id, library.id ])
      expect(copied.hidden).to be(false)
      expect(ticks(copied)).to eq([ [ "one", false, "a" ], [ "two", false, "b c d" ], [ "three", false, "e" ] ])
      expect(copied.base_items.keys).to eq(%w[a b c d e])
      expect(copied.base_fields.keys).to eq(%w[one two three])
    end

    it "adds an entry after its nearest earlier neighbour and leaves other ticks alone" do
      one = library.entries.first.merge("content" => '<p data-cv-item="a" data-cv-off="true">A</p>', "hidden" => true)
      section = copy_with([ one, { id: "own", content: '<p data-cv-item="o" data-cv-off="true">O</p>' } ], base_items: {}, base_fields: {})

      include_content(entry_id: "two")
      include_content(entry_id: "three")

      expect(response).to have_http_status(:ok)
      expect(ticks(section)).to eq([ [ "one", true, "(a)" ], [ "two", false, "b c d" ], [ "three", false, "e" ], [ "own", false, "(o)" ] ])
      expect(section.base_items.keys).to contain_exactly("b", "c", "d", "e")
      expect(section.base_fields.keys).to contain_exactly("two", "three")
    end

    it "puts an entry first when no earlier neighbour is in the CV" do
      section = copy_with([ { id: "own" }, library.entries.last ])

      include_content(entry_id: "one")

      expect(ticks(section).map(&:first)).to eq(%w[one own three])
    end

    it "copies the section for one entry, leaving out the others" do
      include_content(entry_id: "two")

      expect(ticks(copied)).to eq([ [ "one", true, "(a)" ], [ "two", false, "b c d" ], [ "three", true, "(e)" ] ])
    end

    it "copies the section and entry for one item, with only that item ticked" do
      include_content(entry_id: "two", item_id: "c")

      expect(copied.hidden).to be(false)
      expect(ticks(copied)).to eq([ [ "one", true, "(a)" ], [ "two", false, "(b) c (d)" ], [ "three", true, "(e)" ] ])
    end

    it "copies a missing entry for one item into a section the CV has" do
      section = copy_with([ library.entries.last ])

      include_content(entry_id: "two", item_id: "d")

      expect(ticks(section)).to eq([ [ "two", false, "(b) (c) d" ], [ "three", false, "e" ] ])
    end

    it "adds a missing item to its entry, in its place and kind of list" do
      section = copy_with([ { id: "two", hidden: true, content: '<p data-cv-item="b" data-cv-off="true">Mine</p>' } ], base_items: {}, base_fields: {})

      include_content(entry_id: "two", item_id: "d")

      expect(ticks(section)).to eq([ [ "two", false, "(b) d" ] ])
      expect(section.entries.sole["content"]).to end_with('<ol><li data-cv-item="d">D</li></ol>')
      expect(section.base_items).to eq("d" => '<li data-cv-item="d">D</li>')
      expect(section.base_fields).to eq({})
    end

    it "ticks an item the CV has and shows its entry and section, text unchanged" do
      section = copy_with([
        { id: "one", hidden: true },
        { id: "two", title: "Mine", hidden: true, content: '<p data-cv-item="b" data-cv-off="true">My B</p><p data-cv-item="c" data-cv-off="true">My C</p>' }
      ], hidden: true)

      include_content(entry_id: "two", item_id: "b")

      expect(section.reload.hidden).to be(false)
      expect(ticks(section)).to eq([ [ "one", true, "" ], [ "two", false, "b (c)" ] ])
      expect(section.entries.last).to include("title" => "Mine", "content" => a_string_including("My B", "My C"))
    end

    it "ticks an item where the CV has it, though the library moved it to another entry" do
      section = copy_with([ { id: "three", content: '<p data-cv-item="b" data-cv-off="true">B</p>' } ])

      include_content(entry_id: "two", item_id: "b")

      expect(ticks(section)).to eq([ [ "three", false, "b" ] ])
    end

    it "doesn't copy items the CV already has in another entry" do
      section = copy_with([ { id: "three", content: '<p data-cv-item="c" data-cv-off="true">C</p>' } ])

      include_content(entry_id: "two")

      expect(ticks(section)).to eq([ [ "two", false, "b d" ], [ "three", false, "(c)" ] ])
    end

    it "shows an entry the CV has and adds what it lacks, leaving its ticks alone" do
      section = copy_with([ { id: "two", hidden: true, content: '<ol><li data-cv-item="c" data-cv-off="true">My C</li></ol>' } ], hidden: true)

      include_content(entry_id: "two")

      expect(section.reload.hidden).to be(false)
      expect(ticks(section)).to eq([ [ "two", false, "b (c) d" ] ])
    end

    it "shows a section the CV has and adds missing entries, leaving other ticks alone" do
      section = copy_with([ { id: "two", hidden: true, content: '<p data-cv-item="b" data-cv-off="true">B</p>' } ], hidden: true)

      include_content

      expect(section.reload.hidden).to be(false)
      expect(ticks(section)).to eq([ [ "one", false, "a" ], [ "two", true, "(b)" ], [ "three", false, "e" ] ])
    end

    it "changes the first of several copies" do
      second, first = curriculum.import_section_templates!([ library, library ])
      second.update!(position: 9)
      [ first, second ].each { |copy| copy.update!(hidden: true) }

      include_content(entry_id: "one")

      expect([ first, second ].map { |copy| copy.reload.hidden }).to eq([ false, true ])
    end

    it "doesn't find another user's section, or an unknown entry or item" do
      foreign = create(:section_template)
      requests = [
        { section_template_id: foreign.id }, { section_template_id: 0 },
        { entry_id: "nope" }, { entry_id: "one", item_id: "nope" }, { entry_id: "one", item_id: "b" }
      ]

      requests.each do |params|
        expect { include_content(**params) }.not_to change(CurriculumSection, :count)
        expect(response).to have_http_status(:not_found)
      end
    end

    it "forbids another user's CV" do
      include_content(into: create(:curriculum))

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "what a copy was made from" do
    it "can't be set by clients" do
      before = section.attributes.slice("base_items", "base_fields")

      put "/api/v1/curriculums/#{curriculum.id}/sections/#{section.id}",
        params: { hidden: true, base_items: { a: "x" }, base_fields: { a: { title: "x" } } }, headers: headers, as: :json

      expect(section.reload.attributes).to include(before)
      expect(section.base_items).to be_present
    end

    it "is updated one value at a time" do
      template.update!(entries: [ { id: "one", title: "New", content: '<p data-cv-item="a">A2</p><p data-cv-item="b">B2</p>' } ])
      section.update!(base_items: { "a" => "old", "b" => "old" }, base_fields: { "one" => { "title" => "Old" } })

      section.rebase!(template, entry_id: "one", item_id: "a")
      expect(section.reload.base_items).to eq("a" => '<p data-cv-item="a">A2</p>', "b" => "old")
      expect(section.base_fields).to eq("one" => { "title" => "Old" })

      section.rebase!(template, entry_id: "one")
      expect(section.reload.base_fields["one"]).to include("title" => "New", "current" => false)

      template.update!(entries: [ { id: "two" } ])
      section.rebase!(template, entry_id: "one", item_id: "a")
      section.rebase!(template, entry_id: "one")
      expect(section.reload).to have_attributes(base_items: { "b" => "old" }, base_fields: {})
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
