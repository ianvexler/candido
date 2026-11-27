class CvLabelsController < ApplicationController
  before_action :require_authentication
  before_action :set_cv_label, only: %i[update destroy items]

  def index
    labels = current_user.cv_labels.order(Arel.sql("lower(name)"), :id)
    render json: { cv_labels: serialize(labels, with: CvLabelBlueprint) }
  end

  def create
    label = current_user.cv_labels.create!(label_params)
    render json: { cv_label: serialize(label, with: CvLabelBlueprint) }
  end

  def update
    @cv_label.update!(label_params)
    render json: { cv_label: serialize(@cv_label, with: CvLabelBlueprint) }
  end

  def destroy
    snapshot = serialize(@cv_label, with: CvLabelBlueprint)
    @cv_label.destroy!
    render json: { cv_label: snapshot }
  end

  # Labels or unlabels bullets and entries, which are named by their template and id.
  def items
    templates = current_user.section_templates.where(id: targets.map { |target| target[:section_template_id] }).index_by(&:id)
    pairs = targets.map do |target|
      template = templates[target[:section_template_id].to_i]
      raise ApiError.new("Section template not found", status: :not_found) if template.nil?

      [ template, target[:id].to_s ]
    end

    touched = @cv_label.apply!(pairs, on: ActiveModel::Type::Boolean.new.cast(params.fetch(:on, false)) || false)
    render json: { section_templates: serialize(touched, with: SectionTemplateBlueprint) }
  end

  private

  def set_cv_label
    @cv_label = CvLabel.find_owned!(current_user, params[:id])
  end

  def label_params
    params.permit(:name)
  end

  def targets
    @targets ||= Array(params.require(:targets)).map { |target| target.permit(:section_template_id, :id) }
  end
end
