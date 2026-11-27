# Caps how many paid model calls of one kind a user can start in a day.
# Including models define DAILY_LIMIT and LIMIT_NOUN (what a run is called
# to the user, plural: "CV reviews").
module DailyCapped
  extend ActiveSupport::Concern

  WINDOW = 24.hours

  class_methods do
    def limit_reached?(user)
      runs_in_window(user).count >= self::DAILY_LIMIT
    end

    def ensure_under_limit!(user)
      raise ApiError.new(limit_message(user), status: :too_many_requests) if limit_reached?(user)
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

    # Says what the cap is and when the next run frees up. The window rolls,
    # so that's when enough runs in it turn a day old to leave room for one
    # more (normally just the oldest), not "tomorrow".
    def limit_message(user, now: Time.current)
      runs = runs_in_window(user, now: now)
      over = [ runs.count - self::DAILY_LIMIT, 0 ].max
      oldest_to_expire = runs.order(:created_at).offset(over).pick(:created_at) || now - WINDOW
      wait = ActiveSupport::Duration.build([ oldest_to_expire + WINDOW - now, 0 ].max)
      "You can start #{self::DAILY_LIMIT} #{self::LIMIT_NOUN} a day. Your next one opens #{in_words(wait)}."
    end

    private

    def runs_in_window(user, now: Time.current)
      where(user_id: user.id, created_at: (now - WINDOW)..)
    end

    def in_words(wait)
      return "in a minute" if wait < 1.minute
      return "in #{pluralize_unit((wait / 1.minute).ceil, 'minute')}" if wait < 1.hour

      "in about #{pluralize_unit((wait / 1.hour).round.clamp(1, 24), 'hour')}"
    end

    def pluralize_unit(count, unit)
      "#{count} #{count == 1 ? unit : unit.pluralize}"
    end
  end
end
