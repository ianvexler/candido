require "rails_helper"
RSpec.describe JobBoardEntry do
  it "enforces a unique number per user and status" do
    user = create(:user)
    create(:job_board_entry, user: user, status: "PENDING", number: 1)
    duplicate = build(:job_board_entry, user: user, status: "PENDING", number: 1)

    expect(duplicate).not_to be_valid
    expect(duplicate.errors[:number]).to be_present
  end

  it "allows the same number in a different status" do
    user = create(:user)
    create(:job_board_entry, user: user, status: "PENDING", number: 1)
    other = build(:job_board_entry, user: user, status: "APPLIED", number: 1)

    expect(other).to be_valid
  end

  it "assigns the next number for a status" do
    user = create(:user)
    create(:job_board_entry, user: user, status: "PENDING", number: 2)

    expect(described_class.next_number_for(user, "PENDING")).to eq(3)
    expect(described_class.next_number_for(user, "APPLIED")).to eq(1)
  end

  it "serializes status as the uppercase value" do
    entry = create(:job_board_entry, status: "INTERVIEW")

    expect(entry.status).to eq("INTERVIEW")
    expect(entry.as_json["status"]).to eq("INTERVIEW")
  end

  it "finds or creates tags by name for the entry owner" do
    user = create(:user)
    existing = create(:job_board_tag, user: user, name: "Remote")
    entry = create(:job_board_entry, user: user)

    entry.assign_tag_names([ "Remote", "  Startup  ", "" ])

    expect(entry.job_board_tags.map(&:name)).to contain_exactly("Remote", "Startup")
    expect(entry.job_board_tags).to include(existing)
    expect(user.job_board_tags.count).to eq(2)
  end

  describe "the job's CV slot" do
    let(:user) { create(:user) }
    let(:entry) { create(:job_board_entry, user: user, cv_key: "k", cv_text: nil, cv_filename: "cv.pdf") }
    let(:copy) { create(:curriculum, user: user) }

    it "use_cv_copy! links the copy and clears an uploaded file" do
      entry.update!(cover_letter_text: "Dear", cover_letter_key: "ck", cover_letter_filename: "cl.pdf")
      allow(PdfUploader).to receive(:delete_key)

      entry.use_cv_copy!(copy)

      expect(entry.reload).to have_attributes(cv_curriculum: copy, cv_key: nil, cv_text: nil, cv_filename: nil,
        cover_letter_text: "Dear", cover_letter_key: "ck", cover_letter_filename: "cl.pdf")
      expect(PdfUploader).to have_received(:delete_key).with("k")
    end

    it "use_cv_copy! keeps the stored file when the surrounding transaction rolls back" do
      allow(PdfUploader).to receive(:delete_key)
      entry && copy

      ActiveRecord::Base.transaction do
        entry.use_cv_copy!(copy)
        raise ActiveRecord::Rollback
      end

      expect(PdfUploader).not_to have_received(:delete_key)
      expect(entry.reload).to have_attributes(cv_key: "k", cv_curriculum_id: nil)
    end

    it "use_cv_copy! deletes the stored file once the outermost transaction commits" do
      allow(PdfUploader).to receive(:delete_key)

      entry.use_cv_copy!(copy)

      expect(PdfUploader).to have_received(:delete_key).with("k")
    end

    context "with a copy made for this job" do
      let(:copy) { create(:curriculum, user: user, job_board_entry: entry) }

      it "upload_cv! deletes the linked copy when uploading, pasting or removing" do
        [ { text: "x" }, {} ].each do |args|
          linked = create(:curriculum, user: user, job_board_entry: entry)
          entry.use_cv_copy!(linked)

          entry.upload_cv!(**args)

          expect(entry.reload.cv_curriculum_id).to be_nil
          expect(Curriculum.exists?(linked.id)).to be(false)
        end
      end

      it "use_cv_copy! deletes the copy it replaces, but not when relinking the same one" do
        entry.use_cv_copy!(copy)
        entry.use_cv_copy!(copy)
        expect(Curriculum.exists?(copy.id)).to be(true)

        newer = create(:curriculum, user: user, job_board_entry: entry)
        entry.use_cv_copy!(newer)

        expect(entry.reload.cv_curriculum).to eq(newer)
        expect(Curriculum.exists?(copy.id)).to be(false)
      end

      it "deletes the linked copy even when this record was loaded before it was linked" do
        stale = JobBoardEntry.find(entry.id)
        entry.use_cv_copy!(copy)

        stale.use_cv_copy!(create(:curriculum, user: user, job_board_entry: entry))

        expect(Curriculum.exists?(copy.id)).to be(false)
      end

      it "keeps the copy's past reviews, which still count toward the daily limit" do
        run = create(:cv_tailoring, user: user, curriculum: copy)
        entry.use_cv_copy!(copy)

        entry.upload_cv!(text: "x")

        expect(run.reload.curriculum_id).to be_nil
      end

      it "keeps the copy when the surrounding transaction rolls back" do
        entry.use_cv_copy!(copy)

        ActiveRecord::Base.transaction do
          entry.upload_cv!(text: "x")
          raise ActiveRecord::Rollback
        end

        expect(Curriculum.exists?(copy.id)).to be(true)
        expect(entry.reload.cv_curriculum).to eq(copy)
      end
    end

    it "upload_cv! unlinks but keeps a linked CV that wasn't made for this job" do
      entry.use_cv_copy!(copy)

      entry.upload_cv!(text: "x")

      expect(entry.reload.cv_curriculum_id).to be_nil
      expect(Curriculum.exists?(copy.id)).to be(true)
    end

    it "deleting the linked copy empties the slot" do
      entry.use_cv_copy!(copy)

      copy.destroy!

      expect(entry.reload.cv_curriculum_id).to be_nil
    end
  end
end
