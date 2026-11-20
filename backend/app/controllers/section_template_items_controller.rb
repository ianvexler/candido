class SectionTemplateItemsController < ApplicationController
  before_action :require_authentication
  before_action :set_section_template, only: :create
  before_action :set_item, only: %i[update destroy]

  def create
    item = @section_template.add_item!(item_params)
    render json: { item: serialize(item, with: SectionTemplateItemBlueprint) }
  end

  def update
    @item.update!(item_params)
    render json: { item: serialize(@item, with: SectionTemplateItemBlueprint) }
  end

  def destroy
    snapshot = serialize(@item, with: SectionTemplateItemBlueprint)
    @item.destroy!
    render json: { item: snapshot }
  end

  private

  def set_section_template
    @section_template = SectionTemplate.find_owned!(
      current_user,
      params[:section_template_id],
      unauthorized_message: "You are not authorized to update this section template"
    )
  end

  def set_item
    @item = SectionTemplateItem.find_owned!(current_user, params[:id])
    if params[:section_template_id].present? && @item.section_template_id != params[:section_template_id].to_i
      raise ApiError.new("Section template item not found", status: :not_found)
    end
  end

  def item_params
    params.permit(:kind, :body, :hidden)
  end
end
