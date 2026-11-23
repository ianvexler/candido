module CurriculumScoped
  extend ActiveSupport::Concern

  private

  def render_curriculum(curriculum)
    curriculum = Curriculum.includes(:user, :curriculum_sections).find(curriculum.id)
    render json: { curriculum: serialize(curriculum, with: CurriculumBlueprint, view: :full) }
  end

  def find_section!(curriculum)
    section = curriculum.curriculum_sections.find_by(id: params[:id])
    raise ApiError.new("Section not found", status: :not_found) if section.nil?

    section
  end

  # The current user's library sections, in the order the ids were given.
  # Any id that isn't theirs is reported as not found.
  def owned_templates(ids)
    ids = Array(ids).map(&:to_i).uniq
    return [] if ids.empty?

    templates = current_user.section_templates.where(id: ids).index_by(&:id)
    missing = ids - templates.keys
    raise ApiError.new("Section template not found", status: :not_found) if missing.any?

    ids.map { |id| templates.fetch(id) }
  end
end
