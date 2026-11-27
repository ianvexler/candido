# What of a library section fits a purpose (a CvLabel id; nil means Everything).
#
# An item fits when neither it nor its entry has labels, or one of them has the
# purpose's label. A summary has no labels of its own, so it follows its entry.
# An entry fits when one of its items does, or, with no items, by its own
# labels. Its summary doesn't count towards that. A section fits when one of
# its entries does. The client applies the same rule; see
# spec/fixtures/purpose_fit_cases.json.
class CvPurpose
  def initialize(template, label_id)
    @template = template
    @label_id = label_id
    @item_ids = {}
  end

  def item_fits?(entry, item_id)
    return true if @label_id.nil?

    labels = labels_of(entry["id"])
    labels |= labels_of(item_id) unless item_id == SectionContent::SUMMARY_ID
    fits?(labels)
  end

  def entry_fits?(entry)
    return true if @label_id.nil?

    ids = item_ids(entry)
    return fits?(labels_of(entry["id"])) if ids.empty?

    ids.any? { |id| item_fits?(entry, id) }
  end

  def section_fits?
    @label_id.nil? || @template.entries.any? { |entry| entry_fits?(entry) }
  end

  private

  def fits?(labels)
    labels.empty? || labels.include?(@label_id)
  end

  def labels_of(id)
    @template.item_labels.fetch(id, [])
  end

  def item_ids(entry)
    @item_ids[entry["id"]] ||= CvItems.list(entry["content"]).pluck(:id).compact
  end
end
