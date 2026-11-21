# Saved resume designs. Applying one is a normal resume update of its styles.
class ResumeDesignsController < ApplicationController
  before_action :require_authentication
  before_action :set_design, only: %i[update destroy]

  def index
    designs = current_user.resume_designs.order(:created_at, :id)
    render json: { resume_designs: serialize(designs, with: ResumeDesignBlueprint) }
  end

  def create
    design = current_user.resume_designs.create!(design_params)
    render json: { resume_design: serialize(design, with: ResumeDesignBlueprint) }, status: :created
  end

  def update
    @design.update!(design_params)
    render json: { resume_design: serialize(@design, with: ResumeDesignBlueprint) }
  end

  def destroy
    snapshot = serialize(@design, with: ResumeDesignBlueprint)
    @design.destroy!
    render json: { resume_design: snapshot }
  end

  private

  def set_design
    @design = ResumeDesign.find_owned!(current_user, params[:id])
  end

  def design_params
    attributes = params.permit(:name, :is_default).to_h
    attributes[:settings] = params[:settings].respond_to?(:to_unsafe_h) ? params[:settings].to_unsafe_h : {} if params.key?(:settings)
    attributes
  end
end
