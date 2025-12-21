class AddIndexToCheerEventsCreatedAt < ActiveRecord::Migration[7.2]
  def change
    add_index :cheer_events, :created_at
  end
end
