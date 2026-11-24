require "rails_helper"
require "rake"

RSpec.describe CvItemsBackfill do
  let(:user) { create(:user) }
  let(:curriculum) { create(:curriculum, user: user) }
  let(:earlier) { Time.zone.parse("2026-01-01 10:00") }
  let(:later) { Time.zone.parse("2026-01-02 10:00") }

  def entry(id, content, **fields)
    {
      "id" => id, "title" => "Engineer", "role" => nil, "organization" => nil, "location" => nil, "start_date" => nil,
      "end_date" => nil, "current" => false, "description" => nil, "content" => content, "hidden" => false
    }.merge(fields.stringify_keys)
  end

  # Stored as it was before items had ids.
  def library(*entries, updated_at: earlier)
    create(:section_template, user: user).tap do |template|
      template.update_columns(entries: entries, item_added_at: { "e" => "then" }, updated_at: updated_at)
    end
  end

  def copy(template, *entries, synced_at: later, cv: curriculum, **columns)
    cv.curriculum_sections.create!(section_template: template, position: cv.next_section_position).tap do |section|
      section.update_columns(entries: entries, synced_at: synced_at, updated_at: earlier, **columns)
    end
  end

  def run
    cv_ids = user.curriculums.pluck(:id)
    user.curriculums.update_all(updated_at: earlier)
    described_class.run!(user).tap { expect(Curriculum.where(id: cv_ids).pluck(:updated_at).uniq - [ earlier ]).to be_empty }
  end

  def items(record, index = 0) = CvItems.list(record.reload.entries[index]["content"])
  def ids(record, index = 0) = items(record, index).pluck(:id)

  it "gives library items ids, unique in the section, without dating them" do
    template = library(entry("e", "<p>A</p><ul><li><p>B</p></li></ul>"), entry("f", '<p data-cv-item="x">C</p>'),
      entry("g", '<p data-cv-item="x">D</p>'))
    run
    all = [ 0, 1, 2 ].flat_map { |index| ids(template, index) }
    expect(all.compact.uniq.size).to eq(4)
    expect(ids(template, 1)).to eq([ "x" ])
    expect(template.reload).to have_attributes(updated_at: earlier, item_added_at: { "e" => "then" })
  end

  it "matches copies by entry id and text, in order for repeats" do
    template = library(entry("e", "<p>A</p><p>A</p><p>B</p>"), entry("f", "<p>C</p>"))
    section = copy(template, entry("f", "<p>B</p><p>C</p>"), entry("e", "<p>B</p><p>A</p><p>A</p><p>A</p>"))
    run
    a1, a2, b = ids(template)
    expect(ids(section, 1).first(3)).to eq([ b, a1, a2 ])
    expect(ids(section, 0).last).to eq(ids(template, 1).first)
    library_ids = ids(template) + ids(template, 1)
    own = [ ids(section, 0).first, ids(section, 1).last ]
    expect(own.compact.uniq.size).to eq(2)
    expect(own & library_ids).to be_empty
    expect(section.reload.updated_at).to eq(earlier)
  end

  it "replaces a copy's own id where the text matches, unless the library's is used already" do
    template = library(entry("e", '<p data-cv-item="lib">A</p><p data-cv-item="lib2">B</p>'))
    section = copy(template,
      entry("e", '<p data-cv-item="own">A</p><p data-cv-item="own2">B</p><p data-cv-item="own3">Mine</p>'),
      entry("z", '<p data-cv-item="lib2">Moved</p>'))
    run
    expect(ids(section)).to eq(%w[lib own2 own3])
    expect(ids(section, 1)).to eq([ "lib2" ])
  end

  it "keeps the first of two entries' items with one id" do
    section = copy(nil, entry("e", '<p data-cv-item="x">A</p>'), entry("f", '<p data-cv-item="x">B</p>'))
    run
    expect(ids(section)).to eq([ "x" ])
    expect(ids(section, 1)).not_to include("x", nil)
  end

  it "converts every copy, also one made for a job" do
    template = library(entry("e", "<p>A</p>"))
    section = copy(template, entry("e", "<p>A</p>"))
    tailored = create(:curriculum, user: user, source_curriculum: curriculum, tailored_for: "Acme")
    other = copy(template, entry("e", "<p>A</p>"), cv: tailored)
    run
    expect([ ids(section), ids(other) ]).to all(eq(ids(template)))
  end

  describe "hidden text" do
    it "unticks wholly hidden items and unwraps their text" do
      section = copy(nil, entry("e", "<ul><li><p><span data-cv-hidden=\"true\">A</span> <strong><span data-cv-hidden=\"true\">a</span></strong></p></li><li><p>B</p></li></ul>"))
      expect(run).to include(unticked: 1)
      expect(items(section).pluck(:text, :off)).to eq([ [ "A a", true ], [ "B", false ] ])
      expect(section.entries[0]["content"]).not_to include("data-cv-hidden")
    end

    it "leaves partly hidden items, and hidden sections and entries, as they are" do
      html = '<p>A <span data-cv-hidden="true">b</span></p>'
      section = copy(nil, entry("e", html), entry("f", "<p>C</p>", hidden: true))
      hidden = copy(nil, entry("e", "<p>D</p>"), hidden: true)
      run
      expect(without_item_ids(section.reload.entries[0]["content"])).to eq(html)
      expect(section.entries.pluck("hidden")).to eq([ false, true ])
      expect(hidden.reload).to be_hidden
      expect([ section, hidden ].flat_map { |record| items(record).pluck(:off) }).to eq([ false, false ])
    end

    it "doesn't untick items in a list that is hidden as a whole" do
      html = '<ul data-cv-hidden="true"><li><p>A</p></li></ul>'
      section = copy(nil, entry("e", html))
      run
      expect(without_item_ids(section.reload.entries[0]["content"])).to eq(html)
    end

    it "allows for the style of hidden text being dropped" do
      section = copy(nil, entry("e", '<p><span data-cv-hidden="true" style="color: red">A</span></p>'))
      expect(run).to include(unticked: 1)
      expect(items(section).first[:html]).to eq(%(<p data-cv-item="#{ids(section).first}">A</p>))
    end

    it "gives hidden text in the library ids only" do
      html = '<p><span data-cv-hidden="true">A</span></p>'
      template = library(entry("e", html))
      section = copy(template, entry("e", html))
      run
      expect(without_item_ids(template.reload.entries[0]["content"])).to eq(html)
      expect(ids(section)).to eq(ids(template))
      expect(items(section).first).to include(off: true)
    end
  end

  describe "bases" do
    let(:library_entry) { entry("e", '<p data-cv-item="a">A</p><p data-cv-item="b">B</p>', title: "Lead") }
    let(:cv_entry) { entry("e", '<p data-cv-item="a">A</p><p data-cv-item="b">Mine</p><p data-cv-item="c">C</p>') }

    it "takes the library's text where the copy is up to date" do
      section = copy(library(library_entry, updated_at: later), cv_entry, synced_at: later)
      run
      expect(section.reload.base_items).to eq("a" => '<p data-cv-item="a">A</p>', "b" => '<p data-cv-item="b">B</p>')
      expect(section.base_fields["e"]).to eq(library_entry.slice(*SectionContent::FIELD_KEYS))
    end

    it "takes it only where texts match if the copy is older or was never synced" do
      template = library(library_entry, entry("f", ""), updated_at: later)
      sections = [ earlier, nil ].map { |time| copy(template, cv_entry, entry("f", "", role: ""), synced_at: time) }
      run
      sections.each do |section|
        expect(section.reload.base_items.keys).to eq([ "a" ])
        expect(section.base_fields.keys).to eq([ "f" ])
      end
    end

    it "takes it for equal html only, apart from hidden marks, unless up to date" do
      template = library(entry("e", "<p>A</p><p>B b</p><p>C</p>"), updated_at: later)
      content = '<p><strong>A</strong></p><p>B <span data-cv-hidden="true">b</span></p><p>C</p>'
      stale, current = [ earlier, later ].map { |time| copy(template, entry("e", content), synced_at: time) }
      run
      a, b, c = items(template)
      expect([ stale, current ].map { |section| ids(section) }).to all(eq([ a, b, c ].pluck(:id)))
      expect(stale.reload.base_items).to eq([ b, c ].to_h { |item| item.values_at(:id, :html) })
      expect(current.reload.base_items).to eq([ a, b, c ].to_h { |item| item.values_at(:id, :html) })
    end

    it "drops one left under an id that the copy takes only now" do
      template = library(entry("e", '<p data-cv-item="a">A</p><p data-cv-item="b">B</p>'), updated_at: later)
      section = copy(template, entry("e", '<p data-cv-item="own">A</p><p data-cv-item="own2"><em>B</em></p>'),
        synced_at: earlier, base_items: { "a" => "<p>Old</p>", "b" => "<p>Old</p>", "own" => "<p>Old</p>" })
      run
      expect(ids(section)).to eq(%w[a b])
      expect(section.reload.base_items).to eq("a" => '<p data-cv-item="a">A</p>')
    end

    it "keeps those already set" do
      section = copy(library(library_entry), cv_entry, base_items: { "a" => "<p>Old</p>" }, base_fields: { "e" => { "title" => "Old" } })
      run
      expect(section.reload.base_items).to include("a" => "<p>Old</p>")
      expect(section.base_fields).to eq("e" => { "title" => "Old" })
    end
  end

  it "changes nothing the second time" do
    template = library(entry("e", "<p>A &amp; b&nbsp;c</p><p>A</p>"))
    section = copy(template, entry("e", "<p>A</p><p>A</p><p>Own</p><p><span data-cv-hidden=\"true\">H</span></p>"))
    run
    before = [ template, section ].map { |record| record.reload.attributes }
    expect(run.values).to all(eq(0))
    expect([ template, section ].map { |record| record.reload.attributes }).to eq(before)
  end

  describe "when what a CV shows would change" do
    # A tick where there is no item is dropped, which would show the text.
    let!(:template) { library(entry("e", "<p>A</p>")) }
    let!(:section) do
      copy(template, entry("e", '<ul><li><p>A</p><ul><li data-cv-off="true"><p>B</p></li></ul></li></ul>'))
    end

    it "raises and rolls back" do
      before = [ template, section ].map { |record| record.reload.attributes }
      expect { described_class.run!(user) }.to raise_error(CvItemsBackfill::ContentChanged)
      expect([ template, section ].map { |record| record.reload.attributes }).to eq(before)
    end

    it "also counts the formatting of what is left out" do
      section.update_columns(entries: [ entry("e", '<p data-cv-item="x" data-cv-off="true"><strong>B</strong></p>') ])
      allow(CvItems).to receive(:assign).and_wrap_original { |assign, html, **options| assign.call(html.gsub(/<.?strong>/, ""), **options) }
      expect { described_class.run!(user) }.to raise_error(CvItemsBackfill::ContentChanged)
    end

    it "doesn't stop the task, which prints no content and fails at the end" do
      other = create(:user)
      other_template = create(:section_template, user: other)
      other_template.update_columns(entries: [ entry("e", "<p>Secret</p>") ])
      Rails.application.load_tasks unless Rake::Task.task_defined?("cv_items:backfill")
      Rake::Task["cv_items:backfill"].reenable

      expect do
        expect { Rake::Task["cv_items:backfill"].invoke }.to raise_error(SystemExit) { |error| expect(error.status).to eq(1) }
      end.to output(/User #{other.id}: .*\n(.*\n)*.*1 failed/).to_stdout
        .and output("User #{user.id}: failed (CvItemsBackfill::ContentChanged)\n").to_stderr
      expect(ids(other_template)).to all(be_present)
      expect(ids(template)).to eq([ nil ])
    end
  end
end
