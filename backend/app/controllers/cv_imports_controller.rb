# Upload an existing CV, poll while it's read, then apply the parts the user keeps.
class CvImportsController < ApplicationController
  MAX_SIZE = 5.megabytes
  ACCEPTED_TYPES = [ CvImports::Extractor::PDF, CvImports::Extractor::DOCX ].freeze

  before_action :require_authentication
  before_action -> { CvImport.expire_stale! }, only: :create
  before_action :set_cv_import, only: %i[show apply]

  def create
    raise ApiError.new("CV import isn't available right now.", status: :service_unavailable) unless CvImports::Extractor.configured?
    if CvImport.limit_reached?(current_user)
      raise ApiError.new("You've imported a lot of CVs today. Try again tomorrow.", status: :too_many_requests)
    end

    file = params.require(:file)
    raise ApiError.new("Upload a PDF or Word (.docx) file.", status: :bad_request) unless file.respond_to?(:tempfile)
    raise ApiError.new("That file is over 5 MB.", status: :bad_request) if file.size > MAX_SIZE

    media_type = Marcel::MimeType.for(file.tempfile, name: file.original_filename)
    raise ApiError.new("Upload a PDF or Word (.docx) file.", status: :bad_request) unless ACCEPTED_TYPES.include?(media_type)

    file.tempfile.rewind
    cv_import = current_user.cv_imports.create!(
      filename: File.basename(file.original_filename.to_s).first(255),
      media_type: media_type,
      source_data: Base64.strict_encode64(file.tempfile.read)
    )
    CvImportJob.perform_later(cv_import.id)
    render json: { cv_import: serialize(cv_import, with: CvImportBlueprint) }, status: :created
  end

  def show
    render json: { cv_import: serialize(@cv_import.expire_if_stale!, with: CvImportBlueprint) }
  end

  def apply
    applied = @cv_import.apply!(
      entry_ids: entry_ids,
      fill_profile: ActiveModel::Type::Boolean.new.cast(params[:fill_profile]) || false
    )
    render json: {
      cv_import: serialize(@cv_import, with: CvImportBlueprint),
      section_templates: serialize(applied[:section_templates], with: SectionTemplateBlueprint),
      profile: applied[:profile]
    }
  end

  private

  def entry_ids
    raw = params[:entry_ids]
    return [] if raw.nil?

    valid = raw.is_a?(Array) && raw.all?(String)
    raise ApiError.new("entry_ids must be a list of ids", status: :bad_request) unless valid

    raw
  end

  def set_cv_import
    @cv_import = CvImport.find_owned!(current_user, params[:id])
  end
end
