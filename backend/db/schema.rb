# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.0].define(version: 2026_11_21_140000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  # Custom types defined in this database.
  # Note that some types may not work with other database engines. Be careful if changing database.
  create_enum "FeedbackStatus", ["PENDING", "REVIEWED", "IMPLEMENTED", "CLOSED"]
  create_enum "FeedbackType", ["BUG", "SUGGESTION", "OTHER"]
  create_enum "JobStatus", ["PENDING", "APPLIED", "ASSESSMENT", "INTERVIEW", "OFFERED", "REJECTED", "ACCEPTED", "ARCHIVED"]

  create_table "curriculum_sections", force: :cascade do |t|
    t.bigint "curriculum_id", null: false
    t.bigint "section_template_id"
    t.string "title", null: false
    t.string "section_type", default: "custom", null: false
    t.text "description"
    t.integer "position", default: 0, null: false
    t.boolean "hidden", default: false, null: false
    t.jsonb "styles", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "content", default: "", null: false
    t.datetime "synced_at"
    t.string "role"
    t.string "organization"
    t.string "location"
    t.date "start_date"
    t.date "end_date"
    t.boolean "current", default: false, null: false
    t.index ["curriculum_id", "position"], name: "index_curriculum_sections_on_curriculum_id_and_position"
    t.index ["curriculum_id"], name: "index_curriculum_sections_on_curriculum_id"
    t.index ["section_template_id"], name: "index_curriculum_sections_on_section_template_id"
  end

  create_table "curriculums", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "title", null: false
    t.text "description"
    t.string "layout", default: "single_column", null: false
    t.jsonb "styles", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "header", default: {}, null: false
    t.string "styles_writer"
    t.integer "styles_seq", default: 0, null: false
    t.index ["user_id", "title"], name: "index_curriculums_on_user_id_and_title"
    t.index ["user_id"], name: "index_curriculums_on_user_id"
  end

  create_table "cv_imports", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "status", default: "pending", null: false
    t.string "filename", null: false
    t.string "media_type", null: false
    t.text "source_data"
    t.jsonb "result"
    t.string "error_message"
    t.datetime "applied_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id", "created_at"], name: "index_cv_imports_on_user_id_and_created_at"
    t.index ["user_id"], name: "index_cv_imports_on_user_id"
  end

  create_table "feedback_entries", id: :serial, force: :cascade do |t|
    t.integer "user_id", null: false
    t.datetime "created_at", precision: 3, default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.datetime "updated_at", precision: 3, null: false
    t.text "title", null: false
    t.text "content", null: false
    t.enum "type", default: "OTHER", null: false, enum_type: "\"FeedbackType\""
    t.enum "status", default: "PENDING", null: false, enum_type: "\"FeedbackStatus\""
  end

  create_table "job_board_entries", id: :serial, force: :cascade do |t|
    t.text "title", null: false
    t.text "location"
    t.text "description"
    t.text "salary"
    t.text "url"
    t.integer "number", null: false
    t.datetime "created_at", precision: 3, default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.datetime "updated_at", precision: 3, null: false
    t.enum "status", default: "PENDING", null: false, enum_type: "\"JobStatus\""
    t.integer "user_id", null: false
    t.text "company", null: false
    t.text "cover_letter_text"
    t.text "cv_text"
    t.text "cover_letter_filename"
    t.text "cv_filename"
    t.text "cover_letter_key"
    t.text "cv_key"
    t.datetime "closing_date", precision: 3
    t.index ["title"], name: "JobBoardEntry_title_idx"
    t.index ["user_id", "status", "number"], name: "JobBoardEntry_userId_status_number_key", unique: true
  end

  create_table "job_board_entries_tags", primary_key: ["job_board_entry_id", "job_board_tag_id"], force: :cascade do |t|
    t.integer "job_board_entry_id", null: false
    t.integer "job_board_tag_id", null: false
    t.index ["job_board_tag_id"], name: "_JobBoardEntryToJobBoardTag_B_index"
  end

  create_table "job_board_entry_notes", id: :serial, force: :cascade do |t|
    t.integer "user_id", null: false
    t.datetime "created_at", precision: 3, default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.datetime "updated_at", precision: 3, null: false
    t.text "content", null: false
    t.integer "job_board_entry_id", null: false
    t.index ["user_id", "job_board_entry_id"], name: "JobBoardEntryNotes_userId_jobBoardEntryId_idx"
  end

  create_table "job_board_tags", id: :serial, force: :cascade do |t|
    t.text "name", null: false
    t.datetime "created_at", precision: 3, default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.datetime "updated_at", precision: 3, null: false
    t.integer "user_id", null: false
    t.index ["name"], name: "JobBoardTag_name_idx"
    t.index ["user_id", "name"], name: "JobBoardTag_userId_name_key", unique: true
  end

  create_table "resume_designs", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "name", null: false
    t.jsonb "settings", default: {}, null: false
    t.boolean "is_default", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["user_id"], name: "index_resume_designs_on_user_id"
    t.index ["user_id"], name: "index_resume_designs_one_default_per_user", unique: true, where: "is_default"
  end

  create_table "section_templates", force: :cascade do |t|
    t.bigint "user_id", null: false
    t.string "title", null: false
    t.string "section_type", default: "custom", null: false
    t.text "description"
    t.jsonb "styles", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.text "content", default: "", null: false
    t.string "role"
    t.string "organization"
    t.string "location"
    t.date "start_date"
    t.date "end_date"
    t.boolean "current", default: false, null: false
    t.index ["user_id", "section_type"], name: "index_section_templates_on_user_id_and_section_type"
    t.index ["user_id", "title"], name: "index_section_templates_on_user_id_and_title"
    t.index ["user_id"], name: "index_section_templates_on_user_id"
  end

  create_table "sessions", id: :serial, force: :cascade do |t|
    t.integer "user_id", null: false
    t.text "token", null: false
    t.datetime "expires_at", precision: 3, null: false
    t.datetime "created_at", precision: 3, default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.datetime "updated_at", precision: 3, null: false
    t.index ["token"], name: "Session_token_idx"
    t.index ["token"], name: "Session_token_key", unique: true
    t.index ["user_id"], name: "Session_userId_idx"
  end

  create_table "users", id: :serial, force: :cascade do |t|
    t.text "email", null: false
    t.text "name"
    t.text "password_digest"
    t.boolean "verified", default: false, null: false
    t.text "verification_token"
    t.datetime "verification_expires_at", precision: 3
    t.boolean "setup_completed", default: false, null: false
    t.boolean "admin", default: false, null: false
    t.datetime "last_login_at", precision: 3
    t.datetime "created_at", precision: 3, default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.datetime "updated_at", precision: 3, default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.jsonb "resume_profile", default: {}, null: false
    t.index ["email"], name: "User_email_key", unique: true
  end

  add_foreign_key "curriculum_sections", "curriculums"
  add_foreign_key "curriculum_sections", "section_templates"
  add_foreign_key "curriculums", "users"
  add_foreign_key "cv_imports", "users"
  add_foreign_key "feedback_entries", "users", name: "FeedbackEntry_userId_fkey", on_update: :cascade, on_delete: :restrict
  add_foreign_key "job_board_entries", "users", name: "JobBoardEntry_userId_fkey", on_update: :cascade, on_delete: :restrict
  add_foreign_key "job_board_entries_tags", "job_board_entries", name: "_JobBoardEntryToJobBoardTag_A_fkey", on_update: :cascade, on_delete: :cascade
  add_foreign_key "job_board_entries_tags", "job_board_tags", name: "_JobBoardEntryToJobBoardTag_B_fkey", on_update: :cascade, on_delete: :cascade
  add_foreign_key "job_board_entry_notes", "job_board_entries", name: "JobBoardEntryNotes_jobBoardEntryId_fkey", on_update: :cascade, on_delete: :restrict
  add_foreign_key "job_board_entry_notes", "users", name: "JobBoardEntryNotes_userId_fkey", on_update: :cascade, on_delete: :restrict
  add_foreign_key "job_board_tags", "users", name: "JobBoardTag_userId_fkey", on_update: :cascade, on_delete: :restrict
  add_foreign_key "resume_designs", "users"
  add_foreign_key "section_templates", "users"
  add_foreign_key "sessions", "users", name: "Session_userId_fkey", on_update: :cascade, on_delete: :restrict
end
