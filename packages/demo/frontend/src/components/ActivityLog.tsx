function ActivityLog() {
  return (
    <div
      className="h-full p-6"
      style={{
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E0E2EB',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}
    >
      <h2
        className="text-lg font-semibold mb-4"
        style={{ color: '#1a1b1e' }}
      >
        Activity Log
      </h2>

      {/* Activity items will go here */}
      <div style={{ color: '#666666' }}>
        {/* Placeholder for activity items */}
      </div>
    </div>
  )
}

export default ActivityLog