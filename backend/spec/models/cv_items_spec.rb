require "rails_helper"

RSpec.describe CvItems do
  def ids(html) = described_class.list(html).pluck(:id)

  describe ".assign" do
    it "gives each top-level block and list item an id, not nested ones" do
      html = CvItems.assign("<p>A</p><ul><li><p>B</p><ul><li><p>C</p></li></ul></li></ul><p></p>")
      expect(CvItems.list(html).pluck(:text)).to eq([ "A", "B C" ])
      expect(html.scan("data-cv-item").size).to eq(2)
    end

    it "keeps existing ids and gives a repeated id's second use a new ticked one" do
      html = CvItems.assign('<p data-cv-item="a" data-cv-off="true">A</p><p data-cv-item="a" data-cv-off="true">A2</p>')
      first, second = CvItems.list(html)
      expect(first).to include(id: "a", off: true)
      expect(second[:id]).not_to eq("a")
      expect(second[:off]).to be(false)
    end

    it "restores ids and ticks by text when the saved content has no ids" do
      before = '<ul><li data-cv-item="a"><p>A</p></li><li data-cv-item="b" data-cv-off="true"><p>B</p></li></ul>'
      after = CvItems.assign("<ul><li><p>A</p></li><li><p>B</p></li><li><p>New</p></li></ul>", previous: before)
      expect(CvItems.list(after).map { |i| i.values_at(:id, :off) }.first(2)).to eq([ [ "a", false ], [ "b", true ] ])
    end

    it "restores repeated text in order" do
      before = '<p data-cv-item="a">A</p><p data-cv-item="b" data-cv-off="true">A</p>'
      after = CvItems.assign("<p>A</p><p>A</p><p>A</p>", previous: before)
      expect(CvItems.list(after).first(2).map { |i| i.values_at(:id, :off) }).to eq([ [ "a", false ], [ "b", true ] ])
      expect(ids(after).uniq.size).to eq(3)
    end

    it "restores nothing when the saved content has an id" do
      before = '<p data-cv-item="a">A</p><p data-cv-item="b" data-cv-off="true">B</p>'
      after = CvItems.assign('<p data-cv-item="a">A</p><p>B</p>', previous: before)
      expect(CvItems.list(after).last).to include(off: false)
      expect(ids(after).last).not_to eq("b")
    end

    it "treats a quote with nested blocks as one item and clears ids from anything that isn't one" do
      html = CvItems.assign('<blockquote><p data-cv-item="x">Q</p><ul><li data-cv-off="true">R</li></ul></blockquote>' \
                            '<ul data-cv-off="true"><li data-cv-item="y" data-cv-off="true"><p></p></li></ul>')
      expect(CvItems.list(html).pluck(:text)).to eq([ "Q R" ])
      expect(html.scan("data-cv-item").size).to eq(1)
      expect(html).not_to include("data-cv-off")
    end

    it "changes nothing the second time" do
      html = CvItems.assign('<p>A &amp; B&nbsp;C<br>D</p><p></p><ol><li data-cv-off="true"><p>E</p></li></ol><hr><h3>F</h3>')
      expect(CvItems.assign(html)).to eq(html)
      expect(CvItems.assign(html, previous: "<p>A</p>")).to eq(html)
    end
  end

  describe ".list" do
    it "gives an item's html without its tick" do
      expect(CvItems.list('<p data-cv-item="a" data-cv-off="true">A <strong>b</strong>c</p>'))
        .to eq([ { id: "a", text: "A bc", html: '<p data-cv-item="a">A <strong>b</strong>c</p>', off: true } ])
    end
  end

  it "doesn't count a list item outside a list" do
    html = CvItems.assign('<li data-cv-item="x">A</li><p data-cv-item="b">B</p>')
    expect(ids(html)).to eq(%w[b])
    expect(ids(CvItems.upsert(html, '<p data-cv-item="c">C</p>', neighbours: %w[x]))).to eq(%w[c b])
  end

  describe ".set_off" do
    it "sets and clears the ticks of the given items only" do
      html = '<p data-cv-item="a">A</p><ul><li data-cv-item="b" data-cv-off="true">B</li><li data-cv-item="c" data-cv-off="true">C</li></ul>'
      expect(CvItems.list(CvItems.set_off(html, %w[b], false)).pluck(:off)).to eq([ false, false, true ])
      expect(CvItems.list(CvItems.set_off(html, %w[a], true)).pluck(:off)).to eq([ true, true, true ])
    end
  end

  describe ".visible" do
    it "drops unticked items and the lists they leave empty" do
      html = '<p data-cv-item="a">A</p><ul><li data-cv-item="b" data-cv-off="true"><p>B</p></li></ul>'
      expect(CvItems.visible(html)).to eq('<p data-cv-item="a">A</p>')
    end

    it "leaves content without unticked items alone" do
      html = '<p data-cv-item="a">A</p><p></p><ul></ul><ol><li><p></p></li></ol>text<hr>'
      expect(CvItems.visible(html)).to eq(html)
    end

    it "doesn't join the lists around an unticked item" do
      html = '<ul><li data-cv-item="a">A</li></ul><p data-cv-item="b" data-cv-off="true">B</p><ul><li data-cv-item="c">C</li></ul>'
      expect(CvItems.visible(html)).to eq('<ul><li data-cv-item="a">A</li></ul><ul><li data-cv-item="c">C</li></ul>')
    end
  end

  describe ".upsert" do
    let(:list) { '<ul><li data-cv-item="a"><p>A</p></li><li data-cv-item="c" data-cv-off="true"><p>C</p></li></ul>' }

    it "inserts after the nearest earlier neighbour and keeps the off state on replace" do
      added = CvItems.upsert(list, '<li data-cv-item="b"><p>B</p></li>', neighbours: %w[x a])
      expect(ids(added)).to eq(%w[a b c])
      replaced = CvItems.upsert(list, '<li data-cv-item="c"><p>C2</p></li>', neighbours: [])
      expect(CvItems.list(replaced).last).to include(text: "C2", off: true)
    end

    it "keeps a replaced item ticked whatever the new html says" do
      replaced = CvItems.upsert(list, '<li data-cv-item="a" data-cv-off="true"><p>A2</p></li>', neighbours: [])
      expect(CvItems.list(replaced).first).to include(text: "A2", off: false)
    end

    it "writes into empty content" do
      expect(CvItems.upsert("", '<p data-cv-item="b">B</p>', neighbours: %w[a])).to eq('<p data-cv-item="b">B</p>')
      expect(CvItems.upsert("", '<li data-cv-item="b">B</li>', neighbours: [])).to eq('<ul><li data-cv-item="b">B</li></ul>')
    end

    it "inserts first when no neighbour is present" do
      expect(ids(CvItems.upsert(list, '<li data-cv-item="b">B</li>', neighbours: %w[x]))).to eq(%w[b a c])
      expect(ids(CvItems.upsert(list, '<p data-cv-item="b">B</p>', neighbours: []))).to eq(%w[b a c])
    end

    it "splits the list for a paragraph inserted mid-list" do
      expect(CvItems.upsert(list, '<p data-cv-item="b">B</p>', neighbours: %w[a])).to eq(
        '<ul><li data-cv-item="a"><p>A</p></li></ul><p data-cv-item="b">B</p>' \
        '<ul><li data-cv-item="c" data-cv-off="true"><p>C</p></li></ul>'
      )
      expect(CvItems.upsert(list, '<p data-cv-item="b">B</p>', neighbours: %w[c])).to eq("#{list}<p data-cv-item=\"b\">B</p>")
    end

    it "joins the list after a paragraph, or makes one" do
      item = '<li data-cv-item="b">B</li>'
      paragraph = '<p data-cv-item="p">P</p>'
      joined = CvItems.upsert(paragraph + list, item, neighbours: %w[p])
      expect(ids(joined)).to eq(%w[p b a c])
      expect(joined.scan("<ul>").size).to eq(1)
      expect(CvItems.upsert(paragraph, item, neighbours: %w[p])).to eq("#{paragraph}<ul>#{item}</ul>")
    end

    it "keeps a list item sent with its list in a list of that kind" do
      item = '<li data-cv-item="b">B</li>'
      ordered = '<ol><li data-cv-item="o">O</li></ol>'
      expect(CvItems.upsert("", "<ol>#{item}</ol>", neighbours: [])).to eq("<ol>#{item}</ol>")
      expect(CvItems.upsert(list + ordered, "<ol>#{item}</ol>", neighbours: %w[c]))
        .to eq("#{list}<ol>#{item}<li data-cv-item=\"o\">O</li></ol>")
      split = CvItems.upsert(list, "<ol>#{item}</ol>", neighbours: %w[a])
      expect(split.scan(/<[uo]l>/)).to eq(%w[<ul> <ol> <ul>])
      expect(ids(split)).to eq(%w[a b c])
    end

    it "replaces an item with another kind of block in the same place" do
      html = CvItems.upsert(list, '<p data-cv-item="c">C</p>', neighbours: [])
      expect(html).to eq('<ul><li data-cv-item="a"><p>A</p></li></ul><p data-cv-item="c" data-cv-off="true">C</p>')
      expect(CvItems.upsert(html, '<li data-cv-item="c"><p>C</p></li>', neighbours: [])).to eq(list)
    end
  end

  describe ".strip_ticks" do
    it "removes off attributes and unwraps hidden text" do
      html = '<p data-cv-item="a" data-cv-off="true">A <span data-cv-hidden="">b <em>c</em></span> <span>d</span></p>'
      expect(CvItems.strip_ticks(html)).to eq('<p data-cv-item="a">A b <em>c</em> <span>d</span></p>')
    end
  end
end
