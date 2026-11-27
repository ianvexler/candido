require "rails_helper"

# The client checks the same cases against a copy of this file.
RSpec.describe CvPurpose do
  cases = JSON.parse(Rails.root.join("spec/fixtures/purpose_fit_cases.json").read)

  cases.each do |fit_case|
    it fit_case["name"] do
      template = SectionTemplate.new(fit_case["template"])
      purpose = described_class.new(template, fit_case["label_id"])
      entries = template.entries

      items = entries.each_with_object({}) do |entry, fits|
        ids = CvItems.list(entry["content"]).pluck(:id)
        ids.unshift(SectionContent::SUMMARY_ID) if entry["description"].present?
        ids.each { |id| fits["#{entry['id']}/#{id}"] = purpose.item_fits?(entry, id) }
      end
      expect(items).to eq(fit_case["items"])
      expect(entries.to_h { |entry| [ entry["id"], purpose.entry_fits?(entry) ] }).to eq(fit_case["entries"])
      expect(purpose.section_fits?).to be(fit_case["section"])
    end
  end
end
