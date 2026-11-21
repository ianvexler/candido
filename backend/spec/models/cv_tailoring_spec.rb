require "rails_helper"

RSpec.describe CvTailoring do
  let(:user) { create(:user) }

  describe ".limit_reached?" do
    it "counts runs in the last 24 hours" do
      create_list(:cv_tailoring, 10, user: user)
      expect(described_class.limit_reached?(user)).to be(true)
    end

    it "ignores older runs" do
      create_list(:cv_tailoring, 9, user: user)
      create(:cv_tailoring, user: user, created_at: 25.hours.ago)
      expect(described_class.limit_reached?(user)).to be(false)
    end

    it "keeps counting runs whose CV was deleted" do
      runs = create_list(:cv_tailoring, 10, user: user)
      runs.map(&:curriculum).each(&:destroy!)

      expect(described_class.where(id: runs.map(&:id)).pluck(:curriculum_id)).to all(be_nil)
      expect(described_class.limit_reached?(user)).to be(true)
    end
  end

  describe ".expire_stale!" do
    it "fails runs untouched for 10 minutes" do
      stale = create(:cv_tailoring, user: user, status: "processing", updated_at: 11.minutes.ago)
      fresh = create(:cv_tailoring, user: user, status: "processing", updated_at: 2.minutes.ago)

      described_class.expire_stale!

      expect(stale.reload).to have_attributes(status: "failed", error_message: CvTailoring::STALE_MESSAGE)
      expect(fresh.reload.status).to eq("processing")
    end
  end

  describe "#expire_if_stale!" do
    it "fails just this run when stale" do
      stale = create(:cv_tailoring, user: user, status: "pending", updated_at: 11.minutes.ago)
      expect(stale.expire_if_stale!.status).to eq("failed")
    end
  end

  describe ".find_owned!" do
    it "raises not found and forbidden" do
      tailoring = create(:cv_tailoring)
      expect { described_class.find_owned!(user, 0) }.to raise_error(ApiError, "CV tailoring not found")
      expect { described_class.find_owned!(user, tailoring.id) }.to raise_error(ApiError, /not authorized/)
      expect(described_class.find_owned!(tailoring.user, tailoring.id)).to eq(tailoring)
    end
  end

  describe "#active?" do
    it "is true for pending and processing" do
      expect(build(:cv_tailoring, status: "processing")).to be_active
      expect(build(:cv_tailoring, status: "succeeded")).not_to be_active
    end
  end
end

RSpec.describe CvTailoringSuggestion do
  let(:suggestion) { create(:cv_tailoring_suggestion) }

  describe "#resolve!" do
    it "accepts, edits and rejects" do
      accepted, edited, rejected = create_list(:cv_tailoring_suggestion, 3, cv_tailoring: suggestion.cv_tailoring)
      expect(accepted.resolve!(status: "accepted").status).to eq("accepted")
      expect(edited.resolve!(status: "edited", replacement: "My own words"))
        .to have_attributes(status: "edited", replacement: "My own words")
      expect(rejected.resolve!(status: "rejected").status).to eq("rejected")
    end

    it "only resolves a pending suggestion of the latest review" do
      suggestion.resolve!(status: "accepted")
      expect { suggestion.resolve!(status: "rejected") }.to raise_error(ApiError, "This suggestion was already handled.")

      older = create(:cv_tailoring_suggestion)
      create(:cv_tailoring, user: older.cv_tailoring.user, curriculum: older.cv_tailoring.curriculum, created_at: 1.minute.from_now)
      expect { older.resolve!(status: "rejected") }.to raise_error(ApiError, "This review was replaced by a newer one.")
    end

    it "rejects an unknown status" do
      expect { suggestion.resolve!(status: "pending") }.to raise_error(ActiveRecord::RecordInvalid)
      expect { suggestion.resolve!(status: "bogus") }.to raise_error(ActiveRecord::RecordInvalid)
    end

    it "requires replacement text for edited" do
      expect { suggestion.resolve!(status: "edited", replacement: " ") }.to raise_error(ActiveRecord::RecordInvalid)
      expect { suggestion.resolve!(status: "edited", replacement: "x" * 2001) }.to raise_error(ActiveRecord::RecordInvalid)
    end
  end

  describe ".find_owned!" do
    it "checks ownership through the tailoring" do
      other = create(:user)
      expect { described_class.find_owned!(other, suggestion.id) }.to raise_error(ApiError, /not authorized/)
      expect { described_class.find_owned!(other, 0) }.to raise_error(ApiError, "Suggestion not found")
      expect(described_class.find_owned!(suggestion.cv_tailoring.user, suggestion.id)).to eq(suggestion)
    end
  end
end
