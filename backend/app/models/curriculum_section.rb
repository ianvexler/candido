# == Schema Information
#
# Table name: curriculum_sections
#
#  id                  :bigint           not null, primary key
#  base_fields         :jsonb            not null
#  base_items          :jsonb            not null
#  entries             :jsonb            not null
#  hidden              :boolean          default(FALSE), not null
#  placement           :string
#  position            :integer          default(0), not null
#  section_type        :string           default("custom"), not null
#  styles              :jsonb            not null
#  synced_at           :datetime
#  created_at          :datetime         not null
#  updated_at          :datetime         not null
#  curriculum_id       :bigint           not null
#  section_template_id :bigint
#
# Indexes
#
#  index_curriculum_sections_on_curriculum_id               (curriculum_id)
#  index_curriculum_sections_on_curriculum_id_and_position  (curriculum_id,position)
#  index_curriculum_sections_on_section_template_id         (section_template_id)
#
# Foreign Keys
#
#  fk_rails_...  (curriculum_id => curriculums.id)
#  fk_rails_...  (section_template_id => section_templates.id)
#
# `base_items` and `base_fields` hold the library text each item and each
# entry's fields were last matched with, to tell which side changed since.
class CurriculumSection < ApplicationRecord
  include SectionContent

  belongs_to :curriculum, inverse_of: :curriculum_sections, touch: true
  belongs_to :section_template, optional: true

  validates :position, numericality: { only_integer: true, greater_than_or_equal_to: 0 }
  # Column in a two-column template; nil lets the client place it by type.
  PLACEMENTS = %w[main sidebar].freeze
  validates :placement, inclusion: { in: PLACEMENTS, message: "must be main or sidebar" }, allow_nil: true

  before_validation { self.placement = placement.presence }

  SYNCED_FIELDS = %i[section_type entries styles].freeze

  # True when the library section was edited after this copy was last synced.
  def library_updated?
    return false if section_template.nil? || synced_at.nil?

    section_template.updated_at > synced_at
  end

  # Overwrites this copy with the library section's current fields, but
  # still leaves out the entries this resume left out.
  def sync_from_template!
    raise ArgumentError, "section has no library section" if section_template.nil?

    left_out = entries.select { |entry| entry["hidden"] }.pluck("id")
    synced = SYNCED_FIELDS.index_with { |field| section_template.public_send(field).deep_dup }
    synced[:entries] = synced[:entries].map { |entry| entry.merge("hidden" => left_out.include?(entry["id"])) }
    update!(**synced, synced_at: Time.current)
  end

  # Adds copies of the library entries this section doesn't have. They are left
  # out, except for what is being included: everything, one entry, or one item of it.
  def add_missing_entries(template, entry: nil, item_id: nil)
    template.entries.each do |library_entry|
      next if find_entry(library_entry["id"])

      target = entry.nil? || entry["id"] == library_entry["id"]
      add_entry(template, library_entry, ticked: target, only_item: item_id)
    end
  end

  # Ticks library content in this copy, adding what it lacks. Text and ticks of
  # what it already has otherwise stay as they are.
  def include_from_library!(template, entry: nil, item_id: nil)
    self.hidden = false
    if item_id
      include_item(template, entry, item_id)
    elsif entry
      include_entry(template, entry)
    else
      add_missing_entries(template)
    end
    save!
  end

  # Takes the library's current text as the base of one item, or of an entry's
  # fields. Without it in the library there is no base.
  def rebase!(template, entry_id:, item_id: nil)
    entry = template.find_entry(entry_id)
    if item_id
      html = CvItems.list(entry && entry["content"]).find { |item| item[:id] == item_id }&.fetch(:html)
      self.base_items = base_items.merge(item_id => html).compact
    else
      self.base_fields = base_fields.merge(entry_id => entry&.slice(*FIELD_KEYS)).compact
    end
    save!
  end

  private

  def include_item(template, library_entry, item_id)
    if (entry = entry_with_item(item_id))
      change_entry(entry, "content" => CvItems.set_off(entry["content"], [ item_id ], false), "hidden" => false)
    elsif (entry = find_entry(library_entry["id"]))
      add_items(entry, library_entry, [ item_id ])
    else
      add_entry(template, library_entry, ticked: true, only_item: item_id)
    end
  end

  def include_entry(template, library_entry)
    entry = find_entry(library_entry["id"])
    return add_entry(template, library_entry, ticked: true) if entry.nil?

    add_items(entry, library_entry, CvItems.list(library_entry["content"]).pluck(:id).compact - item_ids)
  end

  def add_items(entry, library_entry, ids)
    order = CvItems.list(library_entry["content"]).pluck(:id)
    content = ids.reduce(entry["content"]) do |html, id|
      CvItems.upsert(html, CvItems.find(library_entry["content"], id), neighbours: order.take(order.index(id)))
    end
    change_entry(entry, "content" => content, "hidden" => false)
    self.base_items = base_items.merge(items_by_id(library_entry["content"]).slice(*ids))
  end

  # Goes after its nearest earlier library neighbour. An item this section
  # already has in another entry stays there instead of being copied.
  def add_entry(template, library_entry, ticked:, only_item: nil)
    content = CvItems.visible(CvItems.set_off(library_entry["content"], item_ids, true))
    self.base_items = base_items.merge(items_by_id(content))
    self.base_fields = base_fields.merge(library_entry["id"] => library_entry.slice(*FIELD_KEYS))

    off = ticked && only_item.nil? ? [] : CvItems.list(content).pluck(:id) - [ only_item ]
    copy = library_entry.deep_dup.merge("content" => CvItems.set_off(content, off, true), "hidden" => !ticked)
    earlier = template.entries.pluck("id").take_while { |id| id != copy["id"] }
    after = entries.rindex { |entry| entry["id"] == earlier.reverse.find { |id| find_entry(id) } }
    self.entries = entries.dup.insert(after ? after + 1 : 0, copy)
  end

  def change_entry(entry, changes)
    self.entries = entries.map { |other| other.equal?(entry) ? entry.merge(changes) : other }
  end

  def item_ids
    entries.flat_map { |entry| CvItems.list(entry["content"]).pluck(:id) }.compact
  end

  def items_by_id(html)
    CvItems.list(html).to_h { |item| item.values_at(:id, :html) }.except(nil)
  end
end
