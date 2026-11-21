# Never includes the uploaded file itself.
class CvImportBlueprint < ApplicationBlueprint
  identifier :id
  fields :status, :filename, :error_message, :result, :applied_at, :created_at
end
