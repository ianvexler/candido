# == Schema Information
#
# Table name: cv_labels
#
#  id         :bigint           not null, primary key
#  name       :string           not null
#  created_at :datetime         not null
#  updated_at :datetime         not null
#  user_id    :bigint           not null
#
# Indexes
#
#  index_cv_labels_on_user_id                 (user_id)
#  index_cv_labels_on_user_id_and_lower_name  (user_id, lower((name)::text)) UNIQUE
#
# Foreign Keys
#
#  fk_rails_...  (user_id => users.id)
#
# A purpose the user labels library entries and bullets with, and makes CVs for.
class CvLabel < ApplicationRecord
  MAX_NAME = 40

  belongs_to :user
  has_many :curriculums, dependent: :nullify

  before_validation { self.name = name.to_s.strip }
  validates :name, presence: true, length: { maximum: MAX_NAME }
  validate :name_is_free
  # Before the CVs are released; labels are not part of anything a CV holds.
  before_destroy :strip_from_templates, prepend: true

  def self.find_owned!(user, id)
    label = find_by(id: id)
    raise ApiError.new("Purpose not found", status: :not_found) if label.nil?
    raise ApiError.new("You are not authorized to change this purpose", status: :forbidden) if label.user_id != user.id

    label
  end

  # Puts this label on or takes it off these items and entries of the user's templates. `targets` are
  # [template, id] pairs. Nothing changes unless every id is in its template. Timestamps stay as they were.
  def apply!(targets, on:)
    ids_by_template = targets.group_by(&:first).transform_values { |pairs| pairs.map(&:last).uniq }
    templates = ids_by_template.keys.sort_by(&:id)
    SectionTemplate.transaction do
      templates.each(&:lock!)
      templates.each do |template|
        unknown = ids_by_template[template].reject { |id| template.labellable?(id) }
        raise ApiError.new("Some of that is no longer in the library", status: :unprocessable_content) if unknown.any?
      end
      templates.each { |template| template.set_label!(self, ids_by_template[template], on: on) }
    end
    templates
  end

  private

  def name_is_free
    return if user.nil? || name.blank?

    taken = user.cv_labels.where("lower(name) = ?", name.downcase).where.not(id: id).exists?
    errors.add(:base, "You already have a purpose called #{name}") if taken
  end

  def strip_from_templates
    user.section_templates.order(:id).lock.each do |template|
      next unless template.item_labels.values.any? { |ids| ids.include?(id) }

      labels = template.item_labels.transform_values { |ids| ids - [ id ] }.reject { |_key, ids| ids.empty? }
      template.update_columns(item_labels: labels)
    end
  end
end
