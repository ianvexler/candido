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
end
