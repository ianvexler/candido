# Reads an uploaded CV into a draft. The file is discarded afterwards,
# whether reading worked or not.
class CvImportJob < ApplicationJob
  queue_as :default

  NOTHING_FOUND = "We couldn't find any sections in this file.".freeze
  UNEXPECTED = "Something went wrong reading this CV. Try again later.".freeze

  def perform(cv_import_id)
    # Claim the import in one statement so an expiry can't slip in between
    # checking and starting, and a duplicate run can't read it twice.
    claimed = CvImport.where(id: cv_import_id, status: "pending")
      .update_all(status: "processing", updated_at: Time.current)
    return if claimed.zero?

    cv_import = CvImport.find(cv_import_id)
    output = CvImports::Extractor.new.call(data: Base64.decode64(cv_import.source_data.to_s), media_type: cv_import.media_type)
    draft = CvImports::Draft.from_model_output(output)

    if CvImports::Draft.empty?(draft)
      finish(cv_import, status: "failed", error_message: NOTHING_FOUND)
    else
      finish(cv_import, status: "succeeded", result: draft)
    end
  rescue CvImports::ExtractionError => error
    finish(cv_import, status: "failed", error_message: error.message)
  rescue StandardError
    finish(cv_import, status: "failed", error_message: UNEXPECTED) if cv_import
    raise
  end

  private

  # Only an import still being read is updated: if it expired meanwhile, the
  # user has already been told it failed, so a late result is dropped.
  def finish(cv_import, **attributes)
    cv_import.with_lock do
      cv_import.update!(source_data: nil, **attributes) if cv_import.status == "processing"
    end
  end
end
