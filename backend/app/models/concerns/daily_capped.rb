# Caps how many paid model calls of one kind a user can start in a day.
# Including models define DAILY_LIMIT and LIMIT_MESSAGE.
module DailyCapped
  extend ActiveSupport::Concern

  WINDOW = 24.hours

  class_methods do
    def limit_reached?(user)
      where(user_id: user.id, created_at: WINDOW.ago..).count >= self::DAILY_LIMIT
    end

    def ensure_under_limit!(user)
      raise ApiError.new(self::LIMIT_MESSAGE, status: :too_many_requests) if limit_reached?(user)
    end

    # Checks the limit and records the run while holding a lock on the user, so
    # requests sent at the same moment can't all slip in under the cap.
    # FOR NO KEY UPDATE rather than FOR UPDATE: inserting any row that references
    # the user takes FOR KEY SHARE on it, which FOR UPDATE would wait on, so a
    # caller that has already inserted such a row (a CV copy) could deadlock.
    def start!(user, **attributes)
      transaction do
        user.lock!("FOR NO KEY UPDATE")
        ensure_under_limit!(user)
        create!(user: user, **attributes)
      end
    end
  end
end
