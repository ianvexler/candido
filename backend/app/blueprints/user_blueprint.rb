class UserBlueprint < ApplicationBlueprint
  identifier :id
  fields :email, :name, :verified, :admin, :setup_completed, :last_login_at

  # Whether CV reviews can run at all; without a key the app doesn't ask for them.
  field :reviews_available do |_user, _options|
    CvTailorings::Reviewer.configured?
  end

  field :job_board_entries_count, if: ->(_field, _user, options) { options[:entry_counts].present? } do |user, options|
    options[:entry_counts][user.id] || 0
  end
end
