require "rails_helper"

RSpec.describe ResumeDesign do
  # The lock makes concurrent requests for one user take turns, so the
  # design limit and the single default can't be raced past.
  it "locks the user while creating a design" do
    user = create(:user)
    design = build(:resume_design, user: user)
    expect(user).to receive(:lock!).and_call_original

    design.save!
  end

  it "locks the user while changing the default" do
    design = create(:resume_design)
    user = design.user
    expect(user).to receive(:lock!).and_call_original

    design.update!(is_default: true)
  end

  it "doesn't lock the user for a rename" do
    design = create(:resume_design)
    expect(design.user).not_to receive(:lock!)

    design.update!(name: "Renamed")
  end
end
