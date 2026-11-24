class CurriculumSectionsController < ApplicationController
  include CurriculumScoped

  before_action :require_authentication
  before_action :set_curriculum
  before_action :set_section, only: %i[update destroy]

  # Copies library sections into the CV, or with `section_type` adds an empty
  # section of that type (as the review's "missing sections" do); both append.
  def create
    if params.key?(:section_type)
      @curriculum.add_empty_section!(params.require(:section_type).to_s.strip)
    else
      templates = owned_templates(params.require(:section_template_ids))
      raise ApiError.new("section_template_ids must not be empty", status: :bad_request) if templates.empty?

      @curriculum.import_section_templates!(templates)
    end
    render_curriculum(@curriculum)
  end

  # Ticks a library section, or one entry or item of it, copying in what the CV lacks.
  def include_from_library
    template = owned_templates(params.require(:section_template_id)).first
    ids = params.permit(:entry_id, :item_id).to_h.symbolize_keys.transform_values { |id| id.to_s.presence }
    @curriculum.include_from_library!(template, **ids)
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

  private

  def set_curriculum
    @curriculum = Curriculum.find_owned!(current_user, params[:curriculum_id])
  end

  def set_section
    @section = find_section!(@curriculum)
  end

  def section_params
    params.permit(:section_type, :hidden, :placement, entries: SectionContent::ENTRY_FIELDS).to_h
  end
end
