# == Schema Information
#
# Table name: curriculums
#
#  id                   :bigint           not null, primary key
#  description          :text
#  header               :jsonb            not null
#  layout               :string           default("single_column"), not null
#  styles               :jsonb            not null
#  styles_seq           :integer          default(0), not null
#  styles_writer        :string
#  tailored_for         :string
#  title                :string           not null
#  created_at           :datetime         not null
#  updated_at           :datetime         not null
#  job_board_entry_id   :integer
#  source_curriculum_id :bigint
#  user_id              :bigint           not null
#
# Indexes
#
#  index_curriculums_on_job_board_entry_id    (job_board_entry_id)
#  index_curriculums_on_source_curriculum_id  (source_curriculum_id)
#  index_curriculums_on_user_id               (user_id)
#  index_curriculums_on_user_id_and_title     (user_id,title)
#
# Foreign Keys
#
#  fk_rails_...  (job_board_entry_id => job_board_entries.id) ON DELETE => nullify
#  fk_rails_...  (source_curriculum_id => curriculums.id) ON DELETE => nullify
#  fk_rails_...  (user_id => users.id)
#
class Curriculum < ApplicationRecord
  LAYOUTS = %w[single_column two_column].freeze
  # Paper the resume is printed on; stored as styles["paper"], nil means A4.
  PAPER_SIZES = %w[a4 letter].freeze

  belongs_to :user
  has_many :curriculum_sections, -> { order(:position) }, dependent: :destroy, inverse_of: :curriculum
  # Runs outlive the CV so they keep counting toward the daily limit.
  has_many :cv_tailorings, dependent: :nullify
  # The newest succeeded review with its fit pulled out of the report, so listing jobs skips the
  # full reports. Every other column loads; only `report` is left out, and the record is read-only.
  # DISTINCT ON keeps preloading to one row per CV instead of every succeeded run.
  has_one :latest_fit_tailoring, -> {
    columns = (CvTailoring.column_names - [ "report" ]).map { |c| "cv_tailorings.#{connection.quote_column_name(c)}" }
    where(status: "succeeded")
      .select(Arel.sql("DISTINCT ON (cv_tailorings.curriculum_id) #{columns.join(', ')}, report ->> 'fit' AS fit"))
      .order(:curriculum_id, created_at: :desc, id: :desc)
      .readonly
  }, class_name: "CvTailoring", inverse_of: false
  # The newest run whatever its outcome, with how many of its suggestions are still open and
  # without its report. One row per CV when preloaded, like latest_fit_tailoring.
  has_one :latest_run_summary, -> {
    select(Arel.sql(<<~SQL.squish))
      DISTINCT ON (cv_tailorings.curriculum_id) cv_tailorings.id, cv_tailorings.curriculum_id,
      cv_tailorings.status, cv_tailorings.updated_at,
      (SELECT COUNT(*) FROM cv_tailoring_suggestions
       WHERE cv_tailoring_suggestions.cv_tailoring_id = cv_tailorings.id
       AND cv_tailoring_suggestions.status = 'pending') AS pending_suggestions
    SQL
      .order(:curriculum_id, created_at: :desc, id: :desc)
      .readonly
  }, class_name: "CvTailoring", inverse_of: false
  # Set on a copy made for one job; the links clear if either is deleted.
  belongs_to :job_board_entry, optional: true
  belongs_to :source_curriculum, class_name: "Curriculum", optional: true
  # The job that uses this copy as its CV; the database empties its slot on delete.
  has_one :cv_for_job, class_name: "JobBoardEntry", foreign_key: :cv_curriculum_id, inverse_of: :cv_curriculum

  validates :title, presence: true
  validates :layout, inclusion: { in: LAYOUTS }
  validate :paper_size_is_known

  def self.find_owned!(user, id)
    curriculum = find_by(id: id)
    raise ApiError.new("Curriculum not found", status: :not_found) if curriculum.nil?
    if curriculum.user_id != user.id
      raise ApiError.new("You are not authorized to access this curriculum", status: :forbidden)
    end

    curriculum
  end

  def next_section_position
    (curriculum_sections.maximum(:position) || -1) + 1
  end

  def import_section_templates!(templates)
    templates = Array(templates)
    raise ArgumentError, "templates required" if templates.empty?

    transaction do
      templates.map do |template|
        raise ArgumentError, "template must belong to curriculum owner" if template.user_id != user_id

        curriculum_sections.create!(
          section_template: template,
          section_type: template.section_type,
          entries: template.entries.deep_dup,
          styles: template.styles.deep_dup,
          position: next_section_position,
          hidden: false,
          synced_at: Time.current
        )
      end
    end
  end

  # Appends a section with no content yet for the user to fill in.
  def add_empty_section!(section_type)
    curriculum_sections.create!(section_type: section_type, position: next_section_position)
  end

  # Makes a copy of this resume for a job: same header, styles, layout and
  # sections. Sections go through create! so their callbacks run.
  def duplicate_for_job!(job)
    transaction do
      copy = user.curriculums.create!(
        title: "#{title} – #{job.company}", tailored_for: job.company, job_board_entry: job, source_curriculum: self,
        header: header.deep_dup, styles: styles.deep_dup, layout: layout, description: description
      )
      curriculum_sections.each do |section|
        copy.curriculum_sections.create!(section.attributes.except("id", "curriculum_id", "created_at", "updated_at"))
      end
      copy
    end
  end

  def latest_tailoring
    cv_tailorings.order(created_at: :desc, id: :desc).first
  end

  # Sets section order to match `section_ids`, which must list every section once.
  def reorder_sections!(section_ids)
    ids = Array(section_ids).map(&:to_i)
    current_ids = curriculum_sections.pluck(:id)
    unless ids.size == current_ids.size && ids.sort == current_ids.sort
      raise ArgumentError, "section_ids must list every section in this curriculum exactly once"
    end

    transaction do
      ids.each_with_index do |id, position|
        curriculum_sections.where(id: id).update_all(position: position, updated_at: Time.current)
      end
      touch
    end
    curriculum_sections.reset
  end

  # The header this resume shows: the owner's profile with this resume's overrides on top.
  def resolved_header
    ResumeHeader.resolve(user.resume_header_profile, header)
  end

  def update_header!(raw)
    update!(header: ResumeHeader.normalize_overrides(raw))
  end

  # Merges into the stored styles in one statement, so two requests changing
  # different keys (paper and design, say) can't overwrite each other.
  #
  # A page may number its saves: `writer` identifies the open page and `seq`
  # counts up with each save it sends. A save numbered at or below the last
  # one applied from the same page arrived late and is skipped, so a slow
  # earlier save can't undo a later one.
  def merge_styles!(changes, writer: nil, seq: nil)
    changes = changes.to_h.stringify_keys
    if changes.key?("paper") && !PAPER_SIZES.include?(changes["paper"])
      raise ApiError.new("Paper size must be A4 or Letter", status: :unprocessable_content)
    end

    scope = self.class.where(id: id)
    if writer
      scope.where("styles_writer IS DISTINCT FROM ? OR styles_seq < ?", writer, seq)
        .update_all([ "styles = styles || ?::jsonb, styles_writer = ?, styles_seq = ?, updated_at = ?", changes.to_json, writer, seq, Time.current ])
    else
      scope.update_all([ "styles = styles || ?::jsonb, updated_at = ?", changes.to_json, Time.current ])
    end
    self.styles = scope.pick(:styles)
    clear_attribute_changes([ :styles ])
    self
  end

  def visible_sections
    curriculum_sections.reject(&:hidden?)
  end

  private

  def paper_size_is_known
    paper = styles&.dig("paper")
    return if paper.nil? || PAPER_SIZES.include?(paper)

    errors.add(:base, "Paper size must be A4 or Letter")
  end
end
