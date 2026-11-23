class LibraryTransfersController < ApplicationController
  include CurriculumScoped

  before_action :require_authentication

  # Passes an item or an entry's fields between a CV and the library.
  def create
    curriculum = Curriculum.find_owned!(current_user, params[:curriculum_id])
    section = find_section!(curriculum)
    transfer = LibraryTransfer.new(
      section: section,
      direction: params.require(:direction),
      entry_id: params.require(:entry_id).to_s,
      item_id: params[:item_id].presence&.to_s,
      expected_cv: expected(:expected_cv),
      expected_library: expected(:expected_library)
    )
    transfer.call
    render json: records(transfer.section)
  rescue LibraryTransfer::Conflict => error
    render json: { error: error.message, **records(section.reload) }, status: :conflict
  end

  private

  # An item's html or an entry's fields, only ever compared.
  def expected(key)
    value = params[key]
    value.is_a?(ActionController::Parameters) ? value.to_unsafe_h.to_h : value
  end

  def records(section)
    template = section.section_template
    {
      section: serialize(section, with: CurriculumSectionBlueprint),
      section_template: template && serialize(template, with: SectionTemplateBlueprint)
    }
  end
end
