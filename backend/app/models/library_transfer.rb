# Passes one item, or an entry's fields when there is no `item_id`, between a
# CV section and its library section, or takes the library's text as the base
# (`keep`). The `expected_*` values are what the client has, nil for a side it
# believes is absent; if either is different now, nothing changes.
#
# An item keeps one place in the library: if another entry there has it, that
# is where it is compared and updated.
class LibraryTransfer
  DIRECTIONS = %w[to_library to_cv keep].freeze

  class Conflict < StandardError
    def initialize
      super("This changed elsewhere. Check it and try again.")
    end
  end

  attr_reader :section

  def initialize(section:, direction:, entry_id:, item_id:, expected_cv:, expected_library:)
    @section = section
    @direction = direction
    @entry_id = entry_id
    @item_id = item_id
    @expected_cv = expected_cv
    @expected_library = expected_library
  end

  def call
    raise ApiError, "Unknown direction" if DIRECTIONS.exclude?(@direction)

    SectionTemplate.transaction do
      lock_records
      check
      transfer
    end
    self
  end

  private

  attr_reader :template

  # The library section, then the CV section, then (on saving that) the CV.
  # NO KEY UPDATE so that it doesn't block sections being copied from the
  # library, which may hold a CV this needs.
  def lock_records
    @template = SectionTemplate.lock("FOR NO KEY UPDATE").find_by(id: section.section_template_id)
    section.lock!
    # Linked to a new library section while waiting.
    raise Conflict if section.section_template_id != template&.id

    @entry = section.find_entry(@entry_id)
    @library_entry = find_library_entry
  end

  def find_library_entry
    (@item_id && template&.entry_with_item(@item_id)) || template&.find_entry(@entry_id)
  end

  def transfer
    case @direction
    when "to_library" then to_library
    when "to_cv" then to_cv
    when "keep" then rebase(@library_entry["id"], @item_id)
    end
  end

  def check
    cv = value_in(@entry)
    library = value_in(@library_entry)
    raise ApiError.new("#{@item_id ? 'Item' : 'Entry'} not found", status: :not_found) if cv.nil? && library.nil?
    raise Conflict unless cv == @expected_cv && library == @expected_library
    raise ApiError.new("#{@item_id ? 'Item' : 'Entry'} not found in this CV", status: :not_found) if cv.nil?
    raise ApiError, "This is no longer in your library" if library.nil? && @direction != "to_library"
  end

  def value_in(entry)
    return if entry.nil?
    return fields_of(entry) if @item_id.nil?

    items(entry).find { |item| item[:id] == @item_id }&.fetch(:html)
  end

  def to_library
    adopt_ids if template
    if @library_entry.nil?
      add_entry
    elsif @item_id
      put_item
      template.save!
      rebase(@library_entry["id"], @item_id)
    else
      change_entry(template, @library_entry["id"], fields_of(@entry))
      template.save!
      rebase(@entry_id)
    end
  end

  # Items the library hasn't given ids yet take those of the CV's items with the
  # same text. Otherwise saving would give them others, and they'd be added again.
  def adopt_ids
    taken = template.entries.flat_map { |entry| items(entry).pluck(:id) }.compact
    template.entries = template.entries.map do |entry|
      ours = items(section.find_entry(entry["id"]) || {}).reject { |item| taken.include?(item[:id]) }
      entry.merge("content" => CvItems.adopt_ids(entry["content"], ours))
    end
    @library_entry = find_library_entry
  end

  def to_cv
    changes =
      if @item_id
        item = CvItems.find(@library_entry["content"], @item_id)
        { "content" => CvItems.upsert(@entry["content"], item, neighbours: []) }
      else
        fields_of(@library_entry)
      end
    change_entry(section, @entry_id, changes)
    rebase(@library_entry["id"], @item_id)
  end

  # Copies the entry, with just the item being sent or with everything the
  # library doesn't have in another entry. What it has stays as it is there.
  def add_entry
    content = content_for_copy
    copy = @entry.merge("content" => content, "hidden" => false)
    if template
      put_copy(copy)
      template.save!
    else
      link_new_template(copy)
    end

    rebase(@entry_id)
    CvItems.list(content).pluck(:id).compact.each { |id| rebase(@entry_id, id) }
  end

  def content_for_copy
    return CvItems.strip_ticks(CvItems.find(@entry["content"], @item_id)) if @item_id

    elsewhere = items(@entry).pluck(:id).compact.select { |id| template&.entry_with_item(id) }
    CvItems.visible(CvItems.set_off(CvItems.strip_ticks(@entry["content"]), elsewhere, true))
  end

  # After its nearest earlier neighbour in the CV that the library has.
  def put_copy(copy)
    earlier = section.entries.pluck("id").take_while { |id| id != @entry_id }
    after = template.entries.rindex { |entry| entry["id"] == earlier.reverse.find { |id| template.find_entry(id) } }
    template.entries = template.entries.dup.insert(after ? after + 1 : 0, copy)
  end

  def link_new_template(copy)
    @template = section.curriculum.user.section_templates.create!(
      section_type: section.section_type, styles: section.styles.deep_dup, entries: [ copy ]
    )
    section.section_template = template
  end

  def put_item
    earlier = items(@entry).pluck(:id).take_while { |id| id != @item_id }
    item = CvItems.strip_ticks(CvItems.find(@entry["content"], @item_id))
    content = CvItems.upsert(@library_entry["content"], item, neighbours: earlier)
    change_entry(template, @library_entry["id"], "content" => content)
  end

  def rebase(library_entry_id, item_id = nil)
    section.rebase!(template, entry_id: library_entry_id, item_id: item_id)
  end

  def change_entry(record, id, changes)
    record.entries = record.entries.map { |entry| entry["id"] == id ? entry.merge(changes) : entry }
  end

  def fields_of(entry)
    entry.slice(*SectionContent::FIELD_KEYS)
  end

  def items(entry)
    CvItems.list(entry["content"])
  end
end
