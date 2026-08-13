import { useEffect, useState } from 'react'
import { api } from '../api'
import { Card, Chip, Skeleton } from '../Primitives'

const TONE = { ACCEPTED: 'brand', PICKED_UP: 'brand', ON_TRAIN: 'brand', COMPLETED: 'ok', CANCELLED: 'mute' }
const LABEL = { ACCEPTED: '접수 완료', PICKED_UP: '수취 완료', ON_TRAIN: '운송 중', COMPLETED: '완료', CANCELLED: '취소' }
const PRODUCT = { desk: 'KTX특송 창구', locker: '역사 무인함', relay: '시민 운반', fullmile: '기사 방문 픽업' }

const FILTERS = [
  { id: 'all', label: '전체', match: () => true },
  { id: 'active', label: '진행 중', match: (o) => ['ACCEPTED', 'PICKED_UP', 'ON_TRAIN'].includes(o.status) },
  { id: 'done', label: '완료', match: (o) => o.status === 'COMPLETED' },
  { id: 'cancel', label: '취소', match: (o) => o.status === 'CANCELLED' },
]

export default function History({ onOpen, onResend }) {
  const [orders, setOrders] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    api.get('/orders').then((r) => setOrders(r.orders)).catch(() => setOrders([]))
  }, [])

  const current = FILTERS.find((f) => f.id === filter)
  const shown = orders?.filter(current.match) || []

  return (
    <div className="pb-4">
      <div className="bg-white px-4 pb-4 pt-5">
        <img src="/korail-blue.png" alt="KORAIL" className="h-6" />
        <h1 className="mt-3 text-[24px] font-bold text-g900">접수 내역</h1>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const n = orders ? orders.filter(f.match).length : 0
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`tnum shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold
                  ${filter === f.id ? 'bg-g900 text-white' : 'bg-white text-g700 shadow-card'}`}
              >
                {f.label} {n}
              </button>
            )
          })}
        </div>

        {!orders ? (
          <><Skeleton className="h-28" /><Skeleton className="h-28" /></>
        ) : shown.length === 0 ? (
          <Card className="py-10 text-center text-[14px] text-g500">해당하는 접수가 없어요</Card>
        ) : (
          shown.map((o) => (
            <Card key={o.id}>
              <div role="button" onClick={() => onOpen(o.id)} className="cursor-pointer">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[17px] font-bold text-g900">
                    {o.origin} → {o.destination}
                  </span>
                  <Chip tone={TONE[o.status] || 'mute'}>{LABEL[o.status] || o.status}</Chip>
                </div>
                <div className="mt-1 text-[13px] text-g500">{o.item || '물품'} · {o.id}</div>
                <div className="tnum mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-g100 pt-2 text-[13px] text-g600">
                  <span>{PRODUCT[o.channel] || o.channel}</span>
                  <span>도착 {o.eta}</span>
                  <span>데드라인 {o.deadline}</span>
                  <span>확률 {(o.probability * 100).toFixed(0)}%</span>
                </div>
              </div>
              <button
                onClick={() => onResend(o)}
                className="mt-3 w-full rounded-btn bg-g100 py-3 text-[14px] font-semibold text-g800 active:bg-g200"
              >
                같은 조건으로 다시 보내기
              </button>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
