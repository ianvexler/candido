class CurriculumsController < ApplicationController
  include CurriculumScoped

  before_action :require_authentication
  before_action :set_curriculum, only: %i[show update destroy]

  def index
    curriculums = current_user.curriculums
      .includes(:curriculum_sections, :cv_for_job, :job_board_entry, :source_curriculum, :latest_fit_tailoring, :latest_run_summary)
      .order(updated_at: :desc)
    render json: { curriculums: serialize(curriculums, with: CurriculumBlueprint, view: :listed) }
  end

  def show
    render_curriculum(@curriculum)
  end

  def create
    templates = owned_templates(params[:section_template_ids])
    render_curriculum(Curriculum.create_with_sections!(current_user, curriculum_params, templates))
  end

  # `header`, when sent, replaces this resume's overrides wholesale.
  def update
    Curriculum.transaction do
      @curriculum.update!(curriculum_params)
      @curriculum.update_header!(params[:header]) if params.key?(:header)
      styles = style_params
      @curriculum.merge_styles!(styles, **style_ordering) if styles.present?
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

  # Merged into the existing styles so unrelated settings survive. Design keys
  # are validated here; paper is validated by the model.
  def style_params
    raw = params[:styles]
    return {} if raw.nil?
    ResumeDesignSettings.invalid!("Styles must be an object") unless raw.is_a?(ActionController::Parameters)

    styles = raw.to_unsafe_h
    styles.slice("paper").merge(ResumeDesignSettings.normalize!(styles.except("paper")))
  end

  # Optional ordering for saves from one open page; see Curriculum#merge_styles!.
  def style_ordering
    return {} if params[:styles_writer].blank?

    seq = Integer(params[:styles_seq].to_s, exception: false)
    ResumeDesignSettings.invalid!("Save number must be a whole number") if seq.nil? || seq.negative?

    { writer: params[:styles_writer].to_s.first(64), seq: seq }
  end
end
