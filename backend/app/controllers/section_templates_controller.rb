class SectionTemplatesController < ApplicationController
  before_action :require_authentication
  before_action :set_section_template, only: %i[show update destroy]

  UNAUTHORIZED_MESSAGES = {
    show: "You are not authorized to view this section template",
    update: "You are not authorized to update this section template",
    destroy: "You are not authorized to delete this section template"
  }.freeze

  def index
    templates = current_user.section_templates.in_library_order
    render json: { section_templates: serialize(templates, with: SectionTemplateBlueprint) }
  end

  def show
    render json: { section_template: serialize(@section_template, with: SectionTemplateBlueprint) }
  end

  def create
    template = current_user.section_templates.create!(template_params)
    render json: { section_template: serialize(template, with: SectionTemplateBlueprint) }
  end

  def update
    @section_template.update!(template_params)
    render json: { section_template: serialize(@section_template, with: SectionTemplateBlueprint) }
  end

  def destroy
    snapshot = serialize(@section_template, with: SectionTemplateBlueprint)
    @section_template.destroy!
    render json: { section_template: snapshot }
  end

  private

  def set_section_template
    @section_template = SectionTemplate.find_owned!(
      current_user,
      params[:id],
      unauthorized_message: UNAUTHORIZED_MESSAGES.fetch(action_name.to_sym)
    )
  end

  def template_params
    params.permit(:section_type, entries: SectionContent::ENTRY_FIELDS).to_h
  end
end
