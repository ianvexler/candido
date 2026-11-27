Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check
  root "health#show"
  get "api/v1", to: "health#show"

  scope path: "api/v1" do
    post "sessions/register", to: "sessions#register"
    get "sessions/verify", to: "sessions#verify"
    post "sessions/forgot_password", to: "sessions#forgot_password"
    post "sessions/reset_password", to: "sessions#reset_password"
    get "sessions/me", to: "sessions#me"
    post "sessions", to: "sessions#create"
    delete "sessions", to: "sessions#destroy"

    get "job_board_entries/stats", to: "job_board_entries#stats"
    post "job_board_entries/import", to: "job_board_entries#bulk_import"
    get "job_board_entries", to: "job_board_entries#index"
    post "job_board_entries", to: "job_board_entries#create"
    get "job_board_entries/:id", to: "job_board_entries#show"
    put "job_board_entries/:id", to: "job_board_entries#update"
    delete "job_board_entries/:id", to: "job_board_entries#destroy"
    post "job_board_entries/:id/cv", to: "job_board_entries#upload_cv"
    post "job_board_entries/:id/cover_letter", to: "job_board_entries#upload_cover_letter"

    get "notes/:job_board_entry_id", to: "notes#index"
    post "notes", to: "notes#create"
    put "notes/:id", to: "notes#update"
    delete "notes/:id", to: "notes#destroy"

    put "users", to: "users#update"
    get "users", to: "users#index"
    post "users/:id/resend_verification", to: "users#resend_verification"
    post "users/:id/verify", to: "users#verify"

    post "feedback_entries", to: "feedback_entries#create"
    get "feedback_entries", to: "feedback_entries#index"

    get "section_templates", to: "section_templates#index"
    post "section_templates", to: "section_templates#create"
    put "section_templates/order", to: "section_templates#order"
    get "section_templates/:id", to: "section_templates#show"
    put "section_templates/:id", to: "section_templates#update"
    delete "section_templates/:id", to: "section_templates#destroy"

    get "cv_labels", to: "cv_labels#index"
    post "cv_labels", to: "cv_labels#create"
    put "cv_labels/:id", to: "cv_labels#update"
    delete "cv_labels/:id", to: "cv_labels#destroy"
    put "cv_labels/:id/items", to: "cv_labels#items"

    get "resume_profile", to: "resume_profiles#show"
    put "resume_profile", to: "resume_profiles#update"

    get "resume_designs", to: "resume_designs#index"
    post "resume_designs", to: "resume_designs#create"
    put "resume_designs/:id", to: "resume_designs#update"
    delete "resume_designs/:id", to: "resume_designs#destroy"

    post "cv_imports", to: "cv_imports#create"
    get "cv_imports/:id", to: "cv_imports#show"
    post "cv_imports/:id/apply", to: "cv_imports#apply"

    post "job_board_entries/:job_board_entry_id/tailorings", to: "cv_tailorings#create_for_job"
    post "curriculums/:curriculum_id/tailorings", to: "cv_tailorings#create"
    get "curriculums/:curriculum_id/tailoring", to: "cv_tailorings#show"
    put "cv_tailoring_suggestions/:id", to: "cv_tailorings#update_suggestion"

    get "curriculums", to: "curriculums#index"
    post "curriculums", to: "curriculums#create"
    get "curriculums/:id", to: "curriculums#show"
    put "curriculums/:id", to: "curriculums#update"
    put "curriculums/:id/purpose", to: "curriculums#purpose"
    delete "curriculums/:id", to: "curriculums#destroy"
    post "curriculums/:curriculum_id/include", to: "curriculum_sections#include_from_library"
    post "curriculums/:curriculum_id/sections", to: "curriculum_sections#create"
    put "curriculums/:curriculum_id/sections/order", to: "curriculum_sections#reorder"
    put "curriculums/:curriculum_id/sections/:id", to: "curriculum_sections#update"
    delete "curriculums/:curriculum_id/sections/:id", to: "curriculum_sections#destroy"
    post "curriculums/:curriculum_id/sections/:id/transfer", to: "library_transfers#create"

    get "uploads/:filename",
      to: "uploads#show",
      constraints: { filename: /[^\/]+/ },
      format: false
  end
end
