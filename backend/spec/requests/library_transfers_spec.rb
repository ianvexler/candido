require "rails_helper"

RSpec.describe "Library transfers" do
  let(:user) { create(:user) }
  let(:headers) { auth_headers(user) }
  let(:curriculum) { create(:curriculum, user: user) }
  let(:library) do
    create(:section_template, user: user, section_type: "Projects", entries: [
      { id: "one", title: "One", content: '<p data-cv-item="a">A</p>' },
      { id: "two", title: "Two", content: '<p data-cv-item="b">B</p><ol><li data-cv-item="c">C</li><li data-cv-item="d">D</li></ol>' },
      { id: "three", title: "Three", content: '<p data-cv-item="e">E</p>' }
    ])
  end
  let(:section) { curriculum.import_section_templates!(library).sole }

  # Sends what both sides hold now as what the client has, unless told otherwise.
  def transfer(direction, entry_id, item_id = nil, in_section: section, **overrides)
    in_section.reload
    params = {
      direction: direction, entry_id: entry_id, item_id: item_id,
      expected_cv: current(in_section, entry_id, item_id),
      expected_library: current(in_section.section_template, entry_id, item_id)
    }.merge(overrides)
    post "/api/v1/curriculums/#{in_section.curriculum_id}/sections/#{in_section.id}/transfer",
      params: params.compact, headers: headers, as: :json
  end

  def current(record, entry_id, item_id)
    entry = record&.find_entry(entry_id)
    return entry&.slice(*SectionContent::FIELD_KEYS) unless item_id

    item_html(entry && entry["content"], item_id)
  end

  def item_html(content, item_id) = CvItems.list(content).find { |item| item[:id] == item_id }&.fetch(:html)

  def content_of(record, entry_id) = record.reload.find_entry(entry_id)["content"]

  def item_ids(record, entry_id) = CvItems.list(content_of(record, entry_id)).pluck(:id)

  # Replaces parts of entries, named by id.
  def edit(record, changes)
    record.update!(entries: record.reload.entries.map { |entry| entry.merge(changes.fetch(entry["id"], {})) })
  end

  def entries_json(record) = record.class.where(id: record.id).pick(Arel.sql("entries::text"))

  def everything(*records) = records.map { |record| record.reload.attributes }

  before { section }

  describe "to_library" do
    it "replaces the item, without hidden text or ticks, and changes no CV's text or ticks" do
      other = create(:curriculum, user: user).import_section_templates!(library).sole
      edit(section, "two" => { "content" => '<ol><li data-cv-item="c" data-cv-off="true">C, <span data-cv-hidden="true">better</span></li></ol>' })
      before = [ section, other ].map { |copy| entries_json(copy) }

      transfer("to_library", "two", "c")

      expect(response).to have_http_status(:ok)
      expect(content_of(library, "two"))
        .to eq('<p data-cv-item="b">B</p><ol><li data-cv-item="c">C, better</li><li data-cv-item="d">D</li></ol>')
      expect([ section, other ].map { |copy| entries_json(copy) }).to eq(before)
      expect(section.reload.base_items).to include("c" => '<li data-cv-item="c">C, better</li>', "d" => '<li data-cv-item="d">D</li>')
      expect(other.reload.base_items).to include("c" => '<li data-cv-item="c">C</li>')
      expect(response.parsed_body["section"]).to include("base_items" => section.base_items)
      expect(response.parsed_body["section_template"]).to include("id" => library.id, "entries" => library.entries)
    end

    it "sanitises what it sends" do
      section.update_columns(entries: [ { id: "one", content: '<p data-cv-item="a">A<img src="x" onerror="x()"></p>' } ])

      transfer("to_library", "one", "a")

      expect(content_of(library, "one")).to eq('<p data-cv-item="a">A</p>')
      expect(section.reload.base_items["a"]).to eq('<p data-cv-item="a">A</p>')
    end

    it "adds an item the library lacks after its nearest earlier neighbour" do
      edit(section, "two" => { "content" => '<p data-cv-item="b">B</p><ol><li data-cv-item="c">C</li><li data-cv-item="m">Mine</li><li data-cv-item="n" data-cv-off="true">New</li></ol>' })

      transfer("to_library", "two", "n")

      expect(response).to have_http_status(:ok)
      expect(content_of(library, "two"))
        .to eq('<p data-cv-item="b">B</p><ol><li data-cv-item="c">C</li><li data-cv-item="n">New</li><li data-cv-item="d">D</li></ol>')
      expect(section.reload.base_items).to include("n" => '<li data-cv-item="n">New</li>')
      expect(section.base_items).not_to have_key("m")
    end

    describe "with an item the library has in another entry" do
      before do
        edit(section, "one" => { "content" => "" })
        edit(section, "three" => { "content" => '<p data-cv-item="a">Better</p>' })
      end

      it "updates it there" do
        transfer("to_library", "three", "a", expected_library: '<p data-cv-item="a">A</p>')

        expect(response).to have_http_status(:ok)
        expect(content_of(library, "one")).to eq('<p data-cv-item="a">Better</p>')
        expect(item_ids(library, "three")).to eq([ "e" ])
        expect(section.reload.base_items).to include("a" => '<p data-cv-item="a">Better</p>')
      end

      it "refuses a client that has other text or believes it absent" do
        [ '<p data-cv-item="a">Stale</p>', nil ].each do |expected|
          expect { transfer("to_library", "three", "a", expected_library: expected) }.not_to change { everything(section, library) }
          expect(response).to have_http_status(:conflict)
        end
      end
    end

    describe "with an entry the library lacks" do
      let(:own) do
        { "id" => "own", "title" => "Own", "role" => "Lead", "hidden" => true,
          "content" => '<ul><li data-cv-item="x" data-cv-off="true">X</li><li data-cv-item="y"><span data-cv-hidden="true">Y</span></li></ul>' }
      end

      before { section.update!(entries: section.entries.dup.insert(1, own)) }

      it "copies all of it after its nearest earlier neighbour" do
        before = entries_json(section)

        transfer("to_library", "own")

        expect(response).to have_http_status(:ok)
        expect(library.reload.entries.pluck("id")).to eq(%w[one own two three])
        expect(library.find_entry("own")).to include(
          "title" => "Own", "role" => "Lead", "hidden" => false,
          "content" => '<ul><li data-cv-item="x">X</li><li data-cv-item="y">Y</li></ul>'
        )
        expect(section.reload.base_fields["own"]).to eq(library.find_entry("own").slice(*SectionContent::FIELD_KEYS))
        expect(section.base_items).to include("x" => '<li data-cv-item="x">X</li>', "y" => '<li data-cv-item="y">Y</li>')
        expect(entries_json(section)).to eq(before)
      end

      it "copies its fields and one item of it" do
        transfer("to_library", "own", "y")

        expect(response).to have_http_status(:ok)
        expect(library.reload.find_entry("own")).to include(
          "title" => "Own", "hidden" => false, "content" => '<ul><li data-cv-item="y">Y</li></ul>'
        )
        expect(section.reload.base_fields).to include("own" => a_hash_including("title" => "Own"))
        expect(section.base_items).to include("y" => '<li data-cv-item="y">Y</li>')
        expect(section.base_items).not_to have_key("x")
      end

      it "skips its items that the library has in other entries" do
        edit(section, "one" => { "content" => "" })
        edit(section, "own" => { "content" => '<p data-cv-item="a">Better</p><p data-cv-item="x">X</p>' })
        section.update!(base_items: { "a" => "earlier" })

        transfer("to_library", "own")

        expect(response).to have_http_status(:ok)
        expect(content_of(library, "one")).to eq('<p data-cv-item="a">A</p>')
        expect(content_of(library, "own")).to eq('<p data-cv-item="x">X</p>')
        expect(section.reload.base_items).to eq("a" => "earlier", "x" => '<p data-cv-item="x">X</p>')
      end
    end

    it "creates a library section for a section without one, and links it" do
      alone = curriculum.add_empty_section!("Awards")
      alone.update!(hidden: true, styles: { "color" => "red" }, entries: [
        { id: "one", title: "First", content: '<p data-cv-item="p">P</p>' }, { id: "two", title: "Second" }
      ])

      expect { transfer("to_library", "one", in_section: alone) }.to change(user.section_templates, :count).by(1)

      expect(response).to have_http_status(:ok)
      created = alone.reload.section_template
      expect(created).to have_attributes(section_type: "Awards", styles: { "color" => "red" })
      expect(created.entries.sole).to include("id" => "one", "title" => "First", "content" => '<p data-cv-item="p">P</p>')
      expect(alone.hidden).to be(true)
      expect(alone.base_items).to eq("p" => '<p data-cv-item="p">P</p>')
      expect(alone.base_fields.keys).to eq([ "one" ])
      expect(response.parsed_body["section"]).to include("section_template_id" => created.id)
      expect(response.parsed_body["section_template"]).to include("id" => created.id)
    end

    it "doesn't add an item or entry only the library has" do
      section.update!(entries: [ section.find_entry("two").merge("content" => "") ])

      [ [ "two", "b" ], [ "one" ] ].each do |target|
        expect { transfer("to_library", *target) }.not_to change { everything(section, library) }
        expect(response).to have_http_status(:not_found)
      end
    end
  end

  describe "to_cv" do
    it "replaces the item and keeps it unticked" do
      edit(section, "two" => { "content" => '<p data-cv-item="b" data-cv-off="true">Mine</p><ol><li data-cv-item="c">My C</li></ol>' })
      edit(library, "two" => { "content" => '<p data-cv-item="b">B2</p><ol><li data-cv-item="c">C2</li></ol>' })
      before = entries_json(library)

      transfer("to_cv", "two", "b")

      expect(response).to have_http_status(:ok)
      expect(content_of(section, "two"))
        .to eq('<p data-cv-item="b" data-cv-off="true">B2</p><ol><li data-cv-item="c">My C</li></ol>')
      expect(section.base_items).to include("b" => '<p data-cv-item="b">B2</p>', "c" => '<li data-cv-item="c">C</li>')
      expect(entries_json(library)).to eq(before)
    end

    it "keeps a ticked item ticked and everything hidden hidden" do
      edit(section, "one" => { "hidden" => true })
      section.update!(hidden: true)
      edit(library, "one" => { "content" => '<p data-cv-item="a">A2</p>' })

      transfer("to_cv", "one", "a")

      expect(content_of(section, "one")).to eq('<p data-cv-item="a">A2</p>')
      expect(section).to have_attributes(hidden: true)
      expect(section.find_entry("one")).to include("hidden" => true)
    end
  end

  describe "an entry's fields" do
    let(:theirs) { { "title" => "Library", "role" => "Engineer", "start_date" => "2020-01-01", "hidden" => true } }
    let(:mine) do
      { "title" => "Mine", "organization" => "Acme", "current" => true, "hidden" => true, "content" => '<p data-cv-item="a" data-cv-off="true">My A</p>' }
    end

    before do
      edit(section, "one" => mine)
      edit(library, "one" => theirs)
    end

    it "go to the library as one unit" do
      before = entries_json(section)

      transfer("to_library", "one")

      expect(response).to have_http_status(:ok)
      expect(library.reload.find_entry("one")).to include(
        "title" => "Mine", "organization" => "Acme", "role" => nil, "start_date" => nil, "current" => true,
        "hidden" => true, "content" => '<p data-cv-item="a">A</p>'
      )
      expect(entries_json(section)).to eq(before)
      expect(section.reload.base_fields["one"]).to eq(library.find_entry("one").slice(*SectionContent::FIELD_KEYS))
      expect(section.base_items).to include("a" => '<p data-cv-item="a">A</p>')
    end

    it "go to the CV as one unit" do
      transfer("to_cv", "one")

      expect(response).to have_http_status(:ok)
      expect(section.reload.find_entry("one")).to include(
        "title" => "Library", "organization" => nil, "role" => "Engineer", "start_date" => "2020-01-01", "current" => false,
        "hidden" => true, "content" => mine["content"]
      )
      expect(section.base_fields["one"]).to eq(library.reload.find_entry("one").slice(*SectionContent::FIELD_KEYS))
    end
  end

  describe "keep" do
    it "changes only the base" do
      edit(section, "one" => { "title" => "Mine", "content" => '<p data-cv-item="a">My A</p>' })
      edit(library, "one" => { "title" => "Theirs", "content" => '<p data-cv-item="a">A2</p>' })
      before = [ section, library ].map { |record| entries_json(record) }

      transfer("keep", "one", "a")
      expect(response).to have_http_status(:ok)
      expect(section.reload.base_items).to include("a" => '<p data-cv-item="a">A2</p>')
      expect(section.base_fields["one"]).to include("title" => "One")

      transfer("keep", "one")
      expect(section.reload.base_fields["one"]).to include("title" => "Theirs")
      expect([ section, library ].map { |record| entries_json(record) }).to eq(before)
    end
  end

  describe "what changed since the client read it" do
    it "refuses every direction, with both records as they are now" do
      stale = '<p data-cv-item="a">Stale</p>'
      fields = library.find_entry("one").slice(*SectionContent::FIELD_KEYS).merge("title" => "Stale")

      LibraryTransfer::DIRECTIONS.product([ :expected_cv, :expected_library ], [ [ "a", stale ], [ nil, fields ] ]).each do |direction, side, (item_id, value)|
        [ value, nil ].each do |expected|
          expect { transfer(direction, "one", item_id, side => expected) }.not_to change { everything(section, library, curriculum) }
          expect(response).to have_http_status(:conflict)
          expect(response.parsed_body["error"]).to be_present
          expect(response.parsed_body["section"]).to include("id" => section.id, "entries" => section.entries)
          expect(response.parsed_body["section_template"]).to include("id" => library.id, "entries" => library.entries)
        end
      end
    end

    it "refuses when the client's side is gone, or the library section is" do
      edit(section, "one" => { "content" => "" })
      transfer("to_library", "one", "a", expected_cv: '<p data-cv-item="a">A</p>')
      expect(response).to have_http_status(:conflict)

      fields = library.find_entry("one").slice(*SectionContent::FIELD_KEYS)
      library.destroy!
      expect { transfer("to_library", "one", expected_library: fields) }.not_to change(SectionTemplate, :count)
      expect(response).to have_http_status(:conflict)
      expect(response.parsed_body).to include("section_template" => nil)
    end

    it "ignores ticks" do
      edit(section, "one" => { "content" => '<p data-cv-item="a" data-cv-off="true">A</p>' })

      transfer("to_library", "one", "a", expected_cv: '<p data-cv-item="a">A</p>')

      expect(response).to have_http_status(:ok)
    end
  end

  it "needs the library to have it to take or keep it" do
    edit(section, "one" => { "content" => '<p data-cv-item="own">Own</p>' })
    section.update!(entries: section.entries + [ { id: "own" } ])
    alone = curriculum.add_empty_section!("Awards")

    %w[to_cv keep].each do |direction|
      [ [ section, "one", "own" ], [ section, "own" ], [ alone, alone.entries.sole["id"] ] ].each do |target, *ids|
        expect { transfer(direction, *ids, in_section: target) }.not_to change { target.reload.attributes }
        expect(response).to have_http_status(:unprocessable_content)
      end
    end
  end

  it "rejects an unknown direction, entry, item or section" do
    transfer("sideways", "one")
    expect(response).to have_http_status(:unprocessable_content)

    [ [ "nope" ], [ "one", "nope" ], [ "nope", "nope" ] ].each do |ids|
      transfer("keep", *ids)
      expect(response).to have_http_status(:not_found)
    end

    post "/api/v1/curriculums/#{curriculum.id}/sections/0/transfer", params: { direction: "keep", entry_id: "one" }, headers: headers, as: :json
    expect(response).to have_http_status(:not_found)
  end

  it "forbids another user's CV" do
    foreign = create(:curriculum).add_empty_section!("Awards")

    expect { transfer("to_library", foreign.entries.sole["id"], in_section: foreign) }.not_to change(SectionTemplate, :count)
    expect(response).to have_http_status(:forbidden)
  end
end
