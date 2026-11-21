class CurriculumSectionsController < ApplicationController
  include CurriculumScoped

  before_action :require_authentication
  before_action :set_curriculum
  before_action :set_section, only: %i[update destroy sync]

  # Copies library sections into the CV, appended at the end.
  def create
    templates = owned_templates(params.require(:section_template_ids))
    raise ApiError.new("section_template_ids must not be empty", status: :bad_request) if templates.empty?

    @curriculum.import_section_templates!(templates)
    render_curriculum(@curriculum)
  end

  def update
    @section.update!(section_params)
    render json: { section: serialize(@section, with: CurriculumSectionBlueprint) }
  end

  def destroy
    snapshot = serialize(@section, with: CurriculumSectionBlueprint)
    @section.destroy!
    render json: { section: snapshot }
  end

  def reorder
    @curriculum.reorder_sections!(params.require(:section_ids))
    render_curriculum(@curriculum)
  rescue ArgumentError => error
    raise ApiError.new(error.message, status: :unprocessable_content)
  end

  # Replaces the CV copy with the library section's current version.
  def sync
    if @section.section_template.nil?
      raise ApiError.new("This section is no longer in your library", status: :unprocessable_content)
    end

    @section.sync_from_template!
    render json: { section: serialize(@section, with: CurriculumSectionBlueprint) }
  end

  private

  def set_curriculum
    @curriculum = Curriculum.find_owned!(current_user, params[:curriculum_id])
  end

  def set_section
    @section = @curriculum.curriculum_sections.find_by(id: params[:id])
    raise ApiError.new("Section not found", status: :not_found) if @section.nil?
  end

  def section_params
    params.permit(:title, :section_type, :description, :content, :hidden, :placement, *SectionContent::DETAIL_FIELDS)
  end
end
