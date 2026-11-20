class CurriculumsController < ApplicationController
  include CurriculumScoped

  before_action :require_authentication
  before_action :set_curriculum, only: %i[show update destroy]

  def index
    curriculums = current_user.curriculums.includes(:curriculum_sections).order(updated_at: :desc)
    render json: { curriculums: serialize(curriculums, with: CurriculumBlueprint) }
  end

  def show
    render_curriculum(@curriculum)
  end

  def create
    curriculum = Curriculum.transaction do
      record = current_user.curriculums.create!(curriculum_params)
      templates = owned_templates(params[:section_template_ids])
      record.import_section_templates!(templates) if templates.any?
      record
    end
    render_curriculum(curriculum)
  end

  # `header`, when sent, replaces this resume's overrides wholesale.
  def update
    Curriculum.transaction do
      @curriculum.update!(curriculum_params)
      @curriculum.update_header!(params[:header]) if params.key?(:header)
    end
    render_curriculum(@curriculum)
  end

  def destroy
    snapshot = serialize(@curriculum, with: CurriculumBlueprint)
    @curriculum.destroy!
    render json: { curriculum: snapshot }
  end

  private

  def set_curriculum
    @curriculum = Curriculum.find_owned!(current_user, params[:id])
  end

  def curriculum_params
    params.permit(:title, :description, :layout)
  end
end
