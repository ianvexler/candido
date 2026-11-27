require "rails_helper"

# Real concurrent transactions, so this spec can't run inside the usual
# per-example rollback and cleans up after itself instead.
RSpec.describe DailyCapped do
  self.use_transactional_tests = false

  let!(:user) { create(:user) }
  let(:threads) { 4 }

  after do
    CvTailoring.where(user_id: user.id).delete_all
    CvImport.where(user_id: user.id).delete_all
    Curriculum.where(user_id: user.id).delete_all
    user.delete
  end

  # Runs the block in `threads` threads, each in its own transaction on its own
  # connection, lined up so their first statements overlap. Returns each
  # thread's result, or the error it raised.
  def race
    barrier = Concurrent::CyclicBarrier.new(threads)
    Array.new(threads) do
      Thread.new do
        ActiveRecord::Base.connection_pool.with_connection do
          ActiveRecord::Base.transaction { yield barrier }
        rescue StandardError => error
          error
        end
      end
    end.map(&:value)
  end

  it "lets only the remaining run through when requests arrive together" do
    create_list(:cv_import, CvImport::DAILY_LIMIT - 1, user: user)

    results = race do |barrier|
      barrier.wait(5)
      CvImport.start!(user.reload, filename: "cv.pdf", media_type: "application/pdf", source_data: "eA==")
    end

    expect(results.count { |result| result.is_a?(CvImport) }).to eq(1)
    expect(results.grep(ApiError).map(&:status)).to all(eq(:too_many_requests))
    expect(CvImport.where(user_id: user.id).count).to eq(CvImport::DAILY_LIMIT)
  end

  it "doesn't deadlock when each request has already inserted a row for the user" do
    create_list(:cv_tailoring, CvTailoring::DAILY_LIMIT - 1, user: user)

    # As in tailoring a copy: the CV copy is inserted, then the run is started.
    results = race do |barrier|
      copy = Curriculum.create!(user: user, title: "Copy")
      barrier.wait(5)
      CvTailoring.start!(user.reload, curriculum: copy, job_title: "Engineer", company: "Acme")
    end

    expect(results.grep(ActiveRecord::Deadlocked)).to be_empty
    expect(results.count { |result| result.is_a?(CvTailoring) }).to eq(1)
    expect(results.grep(ApiError).map(&:status)).to all(eq(:too_many_requests))
  end
end
