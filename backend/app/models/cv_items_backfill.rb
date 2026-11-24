# Gives content from before items had ids its ids, ticks and bases. What every
# CV shows stays the same, or nothing of the user's changes. Safe to repeat.
class CvItemsBackfill
  class ContentChanged < StandardError
    def initialize
      super("What a CV shows would change")
    end
  end

  HIDDEN = "data-cv-hidden".freeze
  LEFT_OUT = "[data-cv-off]:not([data-cv-off=\"false\"]), [#{HIDDEN}]".freeze

  # Returns how many records and items changed.
  def self.run!(user)
    new(user).run!
  end

  def initialize(user)
    @user = user
    @counts = { templates: 0, sections: 0, unticked: 0 }
  end

  def run!
    ApplicationRecord.transaction do
      lock_records
      before = snapshot
      @templates.each_value { |template| convert_template(template) }
      @sections.each { |section| convert_section(section) }
      raise ContentChanged if snapshot != before
    end
    @counts
  end

  private

  # In the order in which LibraryTransfer takes them, and as it does.
  def lock_records
    @templates = @user.section_templates.order(:id).lock("FOR NO KEY UPDATE").index_by(&:id)
    @sections = CurriculumSection.where(curriculum_id: @user.curriculums.select(:id)).order(:id).lock.to_a
    @curriculum_ids = @user.curriculums.order(:id).lock.pluck(:id)
  end

  def convert_template(template)
    count(:templates, template, entries: with_ids(template.entries))
  end

  def convert_section(section)
    template = @templates[section.section_template_id]
    entries = with_ids(section.entries)
    renamed = template ? library_ids(entries, template) : {}
    entries = entries.map { |entry| entry.merge("content" => convert_copy(entry["content"], renamed)) }
    count(:sections, section, entries: entries, **bases(section, entries, template, renamed.keys))
  end

  def count(kind, record, changes)
    return if changes.all? { |column, value| record[column] == value }

    record.update_columns(changes)
    @counts[kind] += 1
  end

  def with_ids(entries)
    taken = []
    entries.map do |entry|
      content = CvItems.assign(entry["content"], taken: taken)
      taken += CvItems.list(content).pluck(:id)
      entry.merge("content" => content)
    end
  end

  # The library's id for each item that has an id of its own but the same text
  # in the same entry.
  def library_ids(entries, template)
    known = items_by_id(template.entries).keys
    used = items_by_id(entries).keys.to_set
    entries.each_with_object({}) do |entry, renamed|
      free = CvItems.list(template.find_entry(entry["id"])&.fetch("content")).reject { |item| used.include?(item[:id]) }
      free = free.group_by { |item| item[:text] }
      CvItems.list(entry["content"]).each do |item|
        next if known.include?(item[:id])

        match = free[item[:text]]&.shift
        next if match.nil?

        renamed[item[:id]] = match[:id]
        used << match[:id]
      end
    end
  end

  def convert_copy(html, renamed)
    fragment = Nokogiri::HTML5.fragment(html)
    fragment.css("[#{CvItems::ID}]").each do |item|
      item[CvItems::ID] = renamed.fetch(item[CvItems::ID], item[CvItems::ID])
      untick(item) if wholly_hidden?(item)
    end
    fragment.to_html
  end

  def wholly_hidden?(item)
    texts = item.xpath(".//text()").reject { |text| text.content.blank? }
    texts.any? && texts.all? { |text| text.ancestors.any? { |node| node.element? && node.key?(HIDDEN) } }
  end

  # Ticking it again then shows its text.
  def untick(item)
    [ item, *item.css("[#{HIDDEN}]") ].each do |node|
      node.name == "span" ? node.replace(node.children) : node.remove_attribute(HIDDEN)
    end
    item[CvItems::OFF] = "true"
    @counts[:unticked] += 1
  end

  # The library's text, where this copy was made from it or still matches it.
  def bases(section, entries, template, replaced_ids)
    return {} if template.nil?

    up_to_date = section.synced_at.present? && section.synced_at >= template.updated_at
    library_items = items_by_id(template.entries)
    items = items_by_id(entries).filter_map do |id, item|
      library_item = library_items[id]
      [ id, library_item[:html] ] if library_item && (up_to_date || item[:text] == library_item[:text])
    end
    fields = entries.filter_map do |entry|
      library_entry = template.find_entry(entry["id"])
      [ entry["id"], fields_of(library_entry) ] if library_entry && (up_to_date || same_fields?(entry, library_entry))
    end
    {
      base_items: items.to_h.merge(section.base_items.except(*replaced_ids)),
      base_fields: fields.to_h.merge(section.base_fields)
    }
  end

  def items_by_id(entries)
    entries.flat_map { |entry| CvItems.list(entry["content"]) }.index_by { |item| item[:id] }
  end

  def fields_of(entry)
    entry.slice(*SectionContent::FIELD_KEYS)
  end

  def same_fields?(*entries)
    entries.map { |entry| SectionContent::FIELD_KEYS.map { |key| entry[key].presence } }.uniq.one?
  end

  # What the user's CVs and library show now, and all of their text.
  def snapshot
    curriculums = Curriculum.where(id: @curriculum_ids).includes(:curriculum_sections).order(:id)
    templates = SectionTemplate.where(id: @templates.keys).order(:id)
    [
      templates.map { |template| [ template.id, shown(template.entries) ] },
      curriculums.map do |curriculum|
        sections = curriculum.curriculum_sections.map do |section|
          [ section.attributes.except("entries", "base_items", "base_fields"), shown(section.entries) ]
        end
        [ curriculum.attributes, CvTailorings::CvText.call(curriculum), sections ]
      end
    ]
  end

  def shown(entries)
    entries.map do |entry|
      [ entry.except("content"), visible_html(entry["content"]), Nokogiri::HTML5.fragment(entry["content"]).text ]
    end
  end

  # As the client exports it; see stripHiddenHtml.
  def visible_html(html)
    fragment = Nokogiri::HTML5.fragment(html)
    fragment.css(LEFT_OUT).each(&:remove)
    fragment.css(*CvItems::BLOCKS, "li").each { |node| node.remove if node.text.blank? }
    fragment.css(*CvItems::LISTS).each { |list| list.remove if list.at_css("li").nil? }
    fragment.css("[#{CvItems::ID}]").each { |node| node.remove_attribute(CvItems::ID) }
    # A tick that says "false" doesn't leave anything out.
    fragment.css("[#{CvItems::OFF}]").each { |node| node.remove_attribute(CvItems::OFF) }
    fragment.text.blank? ? "" : fragment.to_html
  end
end
