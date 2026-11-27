namespace :cv_items do
  desc "Give existing CV and library content its item ids, ticks and bases (safe to repeat)"
  task backfill: :environment do
    totals = Hash.new(0)
    failed = 0
    User.find_each do |user|
      counts = CvItemsBackfill.run!(user)
      counts.each { |name, number| totals[name] += number }
      puts "User #{user.id}: #{counts.map { |name, number| "#{number} #{name}" }.join(', ')}" if counts.values.any?(&:positive?)
    rescue StandardError => error
      # Only the class: a message may quote the CV.
      failed += 1
      warn "User #{user.id}: failed (#{error.class})"
    end

    changed = %i[templates sections unticked].map { |name| "#{totals[name]} #{name}" }.join(", ")
    puts "#{User.count} users: #{changed}, #{failed} failed"
    exit 1 if failed.positive?
  end
end
