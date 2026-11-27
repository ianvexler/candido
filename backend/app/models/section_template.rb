# == Schema Information
#
# Table name: section_templates
#
#  id            :bigint           not null, primary key
#  entries       :jsonb            not null
#  item_added_at :jsonb            not null
#  item_labels   :jsonb            not null
#  position      :integer          not null
#  section_type  :string           default("custom"), not null
#  styles        :jsonb            not null
#  created_at    :datetime         not null
#  updated_at    :datetime         not null
#  user_id       :bigint           not null
#
# Indexes
#
#  index_section_templates_on_user_id                   (user_id)
#  index_section_templates_on_user_id_and_section_type  (user_id,section_type)
#  index_section_templates_on_user_id_and_title         (user_id,title)
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
class SectionTemplate < ApplicationRecord
  include SectionContent

  belongs_to :user
  has_many :curriculum_sections, dependent: :nullify

  scope :in_library_order, -> { order(:position, :id) }

  before_create :take_last_position
  before_save :note_added
  before_save :prune_labels
  # Before the copies it unlinks, the order in which LibraryTransfer takes them.
  before_destroy :lock!, prepend: true

  def self.find_owned!(user, id, unauthorized_message:)
    template = find_by(id: id)
    raise ApiError.new("Section template not found", status: :not_found) if template.nil?
    if template.user_id != user.id
      raise ApiError.new(unauthorized_message, status: :forbidden)
    end

    template
  end

  # The entry these ids mean, nil for the whole section. An item has to be in its entry.
  def resolve_entry!(entry_id, item_id)
    return if entry_id.nil? && item_id.nil?

    entry = entry_id.nil? ? entry_with_item(item_id) : find_entry(entry_id)
    raise ApiError.new("Entry not found", status: :not_found) if entry.nil?
    if item_id && !item?(entry, item_id)
      raise ApiError.new("Item not found", status: :not_found)
    end

    entry
  end

  # Whether this id names an entry or a bullet here. A summary has no labels of its own.
  def labellable?(id)
    entries.any? { |entry| entry["id"] == id || CvItems.list(entry["content"]).pluck(:id).include?(id) }
  end

  # Labels or unlabels these ids without changing when the section was last edited.
  def set_label!(label, ids, on:)
    labels = item_labels.deep_dup
    ids.each do |id|
      current = labels.fetch(id, [])
      labels[id] = on ? current | [ label.id ] : current - [ label.id ]
    end
    update_columns(item_labels: labels.reject { |_id, label_ids| label_ids.empty? })
  end

  private

  def take_last_position
    self.position = (user.section_templates.maximum(:position) || -1) + 1
  end

  # Labels stay with the entries and bullets they were put on, and go when those do.
  def prune_labels
    present = entries.flat_map { |entry| [ entry["id"], *CvItems.list(entry["content"]).pluck(:id) ] }
    self.item_labels = item_labels.slice(*present)
  end

  # Keeps `item_added_at` to what is in the section now, with a time for what
  # this save adds. Items that only get their first id now aren't new.
  def note_added
    earlier = entries_was.flat_map { |entry| CvItems.list(entry["content"]) }
    known = earlier.pluck(:id) + entries_was.pluck("id")
    unidentified = earlier.reject { |item| item[:id] }.pluck(:text).tally
    now = Time.current.iso8601(3)

    self.item_added_at = entries.each_with_object({}) do |entry, times|
      times[entry["id"]] = added_at(entry["id"], known, now)
      CvItems.list(entry["content"]).each do |item|
        had_no_id = known.exclude?(item[:id]) && unidentified.fetch(item[:text], 0).positive?
        unidentified[item[:text]] -= 1 if had_no_id
        times[item[:id]] = added_at(item[:id], known, now) unless had_no_id
      end
    end.compact
  end

  def added_at(id, known, now)
    item_added_at[id] || (now if known.exclude?(id))
  end

  def item?(entry, item_id)
    return entry["description"].present? if item_id == SUMMARY_ID

    CvItems.list(entry["content"]).pluck(:id).include?(item_id)
  end

  # Ticks belong to CVs.
  def normalize_entry(...)
    super.merge("description_off" => false)
  end

  def normalize_content(html, previous, taken)
    content = super
    CvItems.set_off(content, CvItems.list(content).pluck(:id), false)
  end
end
