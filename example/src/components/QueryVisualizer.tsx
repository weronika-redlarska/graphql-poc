import { useState } from 'react'

type QueryNodeStatus = 'pending' | 'loading' | 'cached' | 'loaded' | 'error'

export interface QueryNode {
  id: string
  label: string
  status: QueryNodeStatus
  children?: QueryNode[]
}

interface QueryVisualizerProps {
  queryName: string
  tree: QueryNode[]
  isLoading: boolean
  fromCache?: boolean
}

export function QueryVisualizer({ queryName, tree, isLoading, fromCache }: Readonly<QueryVisualizerProps>) {
  const [expanded, setExpanded] = useState(true)

  const getStatusColor = (status: QueryNodeStatus): string => {
    switch (status) {
      case 'pending': return '#d5d5d5'
      case 'loading': return '#ff9800'
      case 'cached': return '#4caf50'
      case 'loaded': return '#2196f3'
      case 'error': return '#f44336'
      default: return '#d5d5d5'
    }
  }

  const getStatusIcon = (status: QueryNodeStatus): string => {
    switch (status) {
      case 'pending': return '⏳'
      case 'loading': return '🔄'
      case 'cached': return '⚡'
      case 'loaded': return '✓'
      case 'error': return '✖'
      default: return '○'
    }
  }

  const renderNode = (node: QueryNode, depth: number = 0): JSX.Element => {
    const indent = depth * 24
    const color = getStatusColor(node.status)
    const icon = getStatusIcon(node.status)
    const isAnimated = node.status === 'loading'
    let backgroundColor = 'transparent'
    if (node.status === 'loading') {
      backgroundColor = '#fff3e0'
    } else if (node.status === 'cached') {
      backgroundColor = '#e8f5e9'
    } else if (node.status === 'loaded') {
      backgroundColor = '#e8f1fb'
    } else if (node.status === 'error') {
      backgroundColor = '#fdecea'
    }
    const emphasis = node.status === 'pending' ? 0.6 : 1
    const boxShadow = node.status === 'pending' ? 'none' : '0 1px 3px rgba(0,0,0,0.08)'

    return (
      <div key={node.id}>
        <div
          style={{
            marginLeft: `${indent}px`,
            padding: '8px 12px',
            marginBottom: '4px',
            backgroundColor,
            borderLeft: `4px solid ${color}`,
            transition: 'all 0.3s ease',
            fontFamily: 'monospace',
            fontSize: '13px',
            borderRadius: '0 4px 4px 0',
            boxShadow,
            opacity: emphasis
          }}
        >
          <span
            style={{
              color,
              marginRight: '10px',
              fontSize: '16px',
              display: 'inline-block',
              animation: isAnimated ? 'spin 1s linear infinite' : 'none'
            }}
          >
            {icon}
          </span>
          <span style={{ color: '#212b32', fontWeight: depth === 0 ? 600 : 400 }}>{node.label}</span>
          {node.status === 'cached' && (
            <span style={{
              marginLeft: '10px',
              color: '#4caf50',
              fontSize: '11px',
              backgroundColor: '#c8e6c9',
              padding: '2px 6px',
              borderRadius: '3px',
              fontWeight: 600
            }}>
              CACHED
            </span>
          )}
          {node.status === 'loading' && (
            <span style={{
              marginLeft: '10px',
              color: '#ff9800',
              fontSize: '11px',
              backgroundColor: '#ffe0b2',
              padding: '2px 6px',
              borderRadius: '3px',
              fontWeight: 600
            }}>
              LOADING
            </span>
          )}
          {node.status === 'loaded' && (
            <span style={{
              marginLeft: '10px',
              color: '#005eb8',
              fontSize: '11px',
              backgroundColor: '#d6e8f8',
              padding: '2px 6px',
              borderRadius: '3px',
              fontWeight: 600
            }}>
              RETURNED
            </span>
          )}
        </div>
        {node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <div
      style={{
        border: '2px solid #005eb8',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: 'white',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        height: 'fit-content',
        position: 'sticky',
        top: '20px'
      }}
    >
      <button
        type="button"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px',
          backgroundColor: '#005eb8',
          color: 'white',
          cursor: 'pointer',
          width: '100%',
          border: 'none',
          textAlign: 'left'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
            📊 {queryName}
          </h3>
          {isLoading && (
            <div style={{ marginTop: '6px', fontSize: '12px', opacity: 0.95 }}>
              Fetch in progress
            </div>
          )}
          {fromCache && (
            <div style={{
              marginTop: '6px',
              fontSize: '12px',
              backgroundColor: '#4caf50',
              display: 'inline-block',
              padding: '3px 8px',
              borderRadius: '4px',
              fontWeight: 600
            }}>
              ⚡ CACHED RESPONSE
            </div>
          )}
        </div>
        <span
          style={{
            fontSize: '20px',
            color: 'white',
            padding: '4px 8px'
          }}
        >
          {expanded ? '▼' : '▶'}
        </span>
      </button>
      {expanded && (
        <div
          style={{
            backgroundColor: '#fafafa',
            padding: '16px',
            maxHeight: '70vh',
            overflowY: 'auto'
          }}
        >
          {tree.map(node => renderNode(node, 0))}

          {/* Legend */}
          <div style={{
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '2px solid #e0e0e0',
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            fontSize: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '16px' }}>⚡</span>
              <span style={{ fontWeight: 600 }}>Cached</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '16px' }}>✓</span>
              <span style={{ fontWeight: 600 }}>Returned</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '16px' }}>🔄</span>
              <span style={{ fontWeight: 600 }}>Loading</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '16px' }}>⏳</span>
              <span style={{ fontWeight: 600 }}>Not fetched yet</span>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
