require "rails_helper"

RSpec.describe CvImport do
  let(:user) { create(:user) }

  describe ".start!" do
    let(:attributes) { { filename: "cv.pdf", media_type: "application/pdf", source_data: "eA==" } }

    it "records an import under the limit while holding a lock on the user" do
      expect(user).to receive(:lock!).and_call_original

      cv_import = described_class.start!(user, **attributes)

      expect(cv_import).to be_persisted
      expect(cv_import.user).to eq(user)
    end

    it "refuses once the limit is reached and records nothing" do
      create_list(:cv_import, described_class::DAILY_LIMIT, user: user)

      expect { described_class.start!(user, **attributes) }
        .to raise_error(ApiError) { |error| expect(error.status).to eq(:too_many_requests) }
        .and not_change(described_class, :count)
    end

    it "ignores imports older than a day" do
      create_list(:cv_import, described_class::DAILY_LIMIT, user: user, created_at: 25.hours.ago)

      expect(described_class.start!(user, **attributes)).to be_persisted
    end
  end

  describe ".limit_message" do
    let(:now) { Time.zone.parse("2026-11-27 12:00") }

    def import_at(time) = create(:cv_import, user: user, created_at: time)

    it "names the cap and when the oldest run in the window turns a day old" do
      import_at(now - 21.hours)
      (described_class::DAILY_LIMIT - 1).times { import_at(now - 1.hour) }

      expect(described_class.limit_message(user, now: now))
        .to eq("You can start 10 CV imports a day. Your next one opens in about 3 hours.")
    end

    it "counts minutes when the next run is under an hour away" do
      import_at(now - 23.hours - 35.minutes)
      (described_class::DAILY_LIMIT - 1).times { import_at(now - 1.hour) }

      expect(described_class.limit_message(user, now: now)).to end_with("opens in 25 minutes.")
    end

    it "says a minute when it's about to open" do
      import_at(now - 23.hours - 59.minutes - 30.seconds)
      (described_class::DAILY_LIMIT - 1).times { import_at(now - 1.hour) }

      expect(described_class.limit_message(user, now: now)).to end_with("opens in a minute.")
    end

    it "waits for enough runs to expire when over the cap" do
      import_at(now - 23.hours)
      import_at(now - 20.hours)
      (described_class::DAILY_LIMIT - 1).times { import_at(now - 1.hour) }

      expect(described_class.limit_message(user, now: now)).to end_with("opens in about 4 hours.")
    end
  end
end
