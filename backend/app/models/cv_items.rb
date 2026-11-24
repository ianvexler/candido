# The items inside an entry's content: each top-level paragraph, heading or
# quote, and each direct item of a top-level list. Whatever is nested in one
# belongs to it, and blank ones don't count.
#
# An item carries its id in data-cv-item, the same in the library and in every
# copy. In a CV an unticked item also has data-cv-off.
module CvItems
  ID = "data-cv-item".freeze
  OFF = "data-cv-off".freeze
  LISTS = %w[ul ol].freeze
  BLOCKS = %w[p h1 h2 h3 h4 h5 h6 blockquote].freeze
  # Text on either side of one of these doesn't run together.
  SEPARATORS = (LISTS + BLOCKS + %w[li br hr]).freeze

  module_function

  def list(html)
    items_in(parse(html)).map do |node|
      off = off?(node)
      node.remove_attribute(OFF)
      { id: node[ID], text: text_of(node), html: node.to_html, off: off }
    end
  end

  # One item as `upsert` takes it, ticked: a list item comes inside its kind of list.
  def find(html, id)
    node = items_in(parse(html)).find { |item| item[ID] == id }
    return if node.nil?

    node.remove_attribute(OFF)
    node.name == "li" ? "<#{node.parent.name}>#{node.to_html}</#{node.parent.name}>" : node.to_html
  end

  # Gives every item its own id and removes ids and ticks from anything else.
  # Content saved without any ids takes them back from `previous`, with their
  # ticks, by matching text. Ids in `taken` count as used already.
  def assign(html, previous: nil, taken: [])
    fragment = parse(html)
    items = items_in(fragment)
    (fragment.css("[#{ID}], [#{OFF}]").to_a - items).each { |node| untag(node) }
    restore(items, previous) if previous.present? && items.none? { |node| valid_id?(node[ID]) }

    seen = Set.new(taken)
    items.each do |node|
      node.remove_attribute(OFF) if seen.include?(node[ID])
      node[ID] = SecureRandom.uuid unless valid_id?(node[ID]) && seen.exclude?(node[ID])
      seen << node[ID]
      mark(node, off?(node))
    end
    fragment.to_html
  end

  # Gives items without an id that of the first item of `others` with the same text.
  def adopt_ids(html, others)
    fragment = parse(html)
    ids = others.select { |item| item[:id] }.group_by { |item| item[:text] }
    items_in(fragment).each do |node|
      match = ids[text_of(node)]&.shift unless valid_id?(node[ID])
      node[ID] = match[:id] if match
    end
    fragment.to_html
  end

  def set_off(html, ids, off)
    fragment = parse(html)
    items_in(fragment).each { |node| mark(node, off) if ids.include?(node[ID]) }
    fragment.to_html
  end

  # Without unticked items, and without lists that leaves empty.
  def visible(html)
    fragment = parse(html)
    items_in(fragment).each { |node| remove(node) if off?(node) }
    fragment.to_html
  end

  # Replaces the item with this id in place, keeping its tick, or inserts it
  # after the last of `neighbours` that is present, else first. A list item may
  # come inside its <ul> or <ol>, which says what kind of list it belongs in;
  # on its own it joins either kind.
  def upsert(html, item_html, neighbours:)
    fragment = parse(html)
    source = parse(item_html)
    new_item = items_in(source).first || source.element_children.find { |node| node.name == "li" }
    return fragment.to_html if new_item.nil?

    kind = new_item.parent.name if list?(new_item.parent)
    items = items_in(fragment)
    index = items.index { |node| node[ID] == new_item[ID] } if new_item[ID]
    if index.nil?
      by_id = items.index_by { |node| node[ID] }
      return insert_item(fragment, new_item, kind, by_id.values_at(*neighbours).compact.last)
    end

    old = items[index]
    mark(new_item, off?(old))
    if (old.name == "li") == (new_item.name == "li")
      old.replace(new_item)
      return fragment.to_html
    end

    remove(old)
    insert_item(fragment, new_item, kind, index.zero? ? nil : items[index - 1])
  end

  def strip_ticks(html)
    fragment = parse(html)
    fragment.css("[#{OFF}]").each { |node| node.remove_attribute(OFF) }
    fragment.css("span[data-cv-hidden]").each { |node| node.replace(node.children) }
    fragment.to_html
  end

  class << self
    private

    def parse(html)
      Nokogiri::HTML5.fragment(html.to_s)
    end

    def items_in(fragment)
      blocks = fragment.element_children.flat_map do |node|
        next node.element_children.select { |child| child.name == "li" } if list?(node)

        BLOCKS.include?(node.name) ? [ node ] : []
      end
      blocks.reject { |node| text_of(node).blank? }
    end

    def list?(node)
      LISTS.include?(node.name)
    end

    def text_of(node)
      words(node).squish
    end

    def words(node)
      return node.content if node.text?

      inner = node.children.map { |child| words(child) }.join
      SEPARATORS.include?(node.name) ? " #{inner} " : inner
    end

    def off?(node)
      node.key?(OFF) && node[OFF] != "false"
    end

    def mark(node, off)
      off ? node[OFF] = "true" : node.remove_attribute(OFF)
    end

    def untag(node)
      node.remove_attribute(ID)
      node.remove_attribute(OFF)
    end

    def valid_id?(id)
      id.to_s.match?(SectionContent::ENTRY_ID)
    end

    def restore(items, previous)
      earlier = list(previous).group_by { |item| item[:text] }
      items.each do |node|
        match = earlier[text_of(node)]&.shift
        next if match.nil?

        node[ID] = match[:id] if match[:id]
        mark(node, true) if match[:off]
      end
    end

    def remove(node)
      parent = node.parent
      node.remove
      parent.remove if list?(parent) && parent.element_children.empty? && parent.text.blank?
    end

    def insert_item(fragment, item, kind, after)
      item.name == "li" ? insert_list_item(fragment, item, kind, after) : insert_block(fragment, item, after)
      fragment.to_html
    end

    def insert_block(fragment, block, after)
      if after.nil?
        fragment.prepend_child(block)
      else
        (after.name == "li" ? split_after(after) : after).add_next_sibling(block)
      end
    end

    def insert_list_item(fragment, item, kind, after)
      return after.add_next_sibling(item) if after&.name == "li" && joins?(after.parent, kind)

      following = following_list(fragment, after)
      return following.prepend_child(item) if following && joins?(following, kind)

      new_list = Nokogiri::XML::Node.new(kind || "ul", fragment.document)
      insert_block(fragment, new_list, after)
      new_list.add_child(item)
    end

    # The list straight after `after`, or the one the content starts with.
    def following_list(fragment, after)
      return fragment.element_children.first if after.nil?
      return after.next_element if after.name != "li"

      after.parent.next_element if after.next_element.nil?
    end

    def joins?(node, kind)
      list?(node) && (kind.nil? || node.name == kind)
    end

    # Moves what follows a list item into a list of its own. Returns the first list.
    def split_after(item)
      first = item.parent
      rest = item.xpath("following-sibling::node()")
      return first if rest.none?(&:element?)

      second = first.dup(0)
      first.add_next_sibling(second)
      rest.each { |node| second.add_child(node) }
      first
    end
  end
end
