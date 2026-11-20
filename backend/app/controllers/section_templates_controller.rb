class SectionTemplatesController < ApplicationController
  before_action :require_authentication
  before_action :set_section_template, only: %i[show update destroy]

  UNAUTHORIZED_MESSAGES = {
    show: "You are not authorized to view this section template",
    update: "You are not authorized to update this section template",
    destroy: "You are not authorized to delete this section template"
  }.freeze

  def index
    templates = current_user.section_templates.includes(:section_template_items).order(created_at: :desc)
    render json: { section_templates: serialize(templates, with: SectionTemplateBlueprint) }
  end

  def show
    render json: { section_template: serialize(@section_template, with: SectionTemplateBlueprint) }
  end

  def create
    template = SectionTemplate.create_for_user!(
      current_user,
      template_params,
      items: item_params
    )
    render json: { section_template: serialize(template, with: SectionTemplateBlueprint) }
  end

  def update
    SectionTemplate.transaction do
      @section_template.update!(template_params)
      @section_template.replace_items!(item_params) if params.key?(:items)
    end
    render json: { section_template: serialize(@section_template.reload, with: SectionTemplateBlueprint) }
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
    params.permit(:title, :section_type, :description)
  end

  def item_params
    Array(params.permit(items: [ :kind, :body, :hidden ])[:items]).map { |item| item.to_h.symbolize_keys }
  end
end
