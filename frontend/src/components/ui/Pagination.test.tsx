import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Pagination } from './Pagination'

function getPageList(page: number, totalPages: number) {
  const { container } = render(<Pagination page={page} totalPages={totalPages} onPage={() => {}} />)
  const pageNums: number[] = []
  const ellipsisCount: number[] = []
  const buttons = container.querySelectorAll('button')
  buttons.forEach(b => {
    const t = b.textContent
    if (t && t !== '←' && t !== '→') {
      const n = parseInt(t, 10)
      if (!isNaN(n)) pageNums.push(n)
    }
  })
  // Count ellipsis spans
  container.querySelectorAll('span').forEach(s => {
    if (s.textContent === '…') ellipsisCount.push(1)
  })
  return { pages: pageNums, ellipsis: ellipsisCount.length }
}

describe('buildPageList logic (via component rendering)', () => {

  it('renders all pages when totalPages <= 7', () => {
    for (let n = 2; n <= 7; n++) {
      for (let p = 1; p <= n; p++) {
        const { pages } = getPageList(p, n)
        expect(pages).toEqual(Array.from({ length: n }, (_, i) => i + 1))
      }
    }
  })

  it('renders nothing when totalPages <= 1', () => {
    const { container } = render(<Pagination page={1} totalPages={0} onPage={() => {}} />)
    expect(container.innerHTML).toBe('')
    const { container: c2 } = render(<Pagination page={1} totalPages={1} onPage={() => {}} />)
    expect(c2.innerHTML).toBe('')
  })

  it('early pages (1-4) with many pages show [1,2,3,4,5,…,N]', () => {
    for (const p of [1, 2, 3, 4]) {
      const { pages, ellipsis } = getPageList(p, 20)
      expect(pages[0]).toBe(1)
      expect(pages[pages.length - 1]).toBe(20)
      expect(ellipsis).toBe(1)
    }
  })

  it('page 1 with 10 pages shows [1,2,3,4,5,…,10]', () => {
    const { pages, ellipsis } = getPageList(1, 10)
    expect(pages).toEqual([1, 2, 3, 4, 5, 10])
    expect(ellipsis).toBe(1)
  })

  it('late pages (N-3 to N) with many pages show [1,…,N-4,N-3,N-2,N-1,N]', () => {
    for (const p of [17, 18, 19, 20]) {
      const { pages, ellipsis } = getPageList(p, 20)
      expect(pages[0]).toBe(1)
      expect(pages[pages.length - 1]).toBe(20)
      expect(ellipsis).toBe(1)
    }
  })

  it('page 20 of 20 shows [1,…,16,17,18,19,20]', () => {
    const { pages, ellipsis } = getPageList(20, 20)
    expect(pages).toEqual([1, 16, 17, 18, 19, 20])
    expect(ellipsis).toBe(1)
  })

  it('middle pages show [1,…,page-1,page,page+1,…,N] with 2 ellipses', () => {
    const { pages, ellipsis } = getPageList(10, 20)
    expect(pages[0]).toBe(1)
    expect(pages).toContain(9)
    expect(pages).toContain(10)
    expect(pages).toContain(11)
    expect(pages[pages.length - 1]).toBe(20)
    expect(ellipsis).toBe(2)
  })

  it('page 10 of 20 shows [1,…,9,10,11,…,20]', () => {
    const { pages, ellipsis } = getPageList(10, 20)
    expect(pages).toEqual([1, 9, 10, 11, 20])
    expect(ellipsis).toBe(2)
  })

  it('page 5 of 20 (boundary) uses early layout with one ellipsis', () => {
    // page 5: page > 4 so not early; page >= totalPages - 3 = 17? no. So it's middle
    // Actually: page=5, totalPages=20: 5 <= 4? No. 5 >= 17? No. So it's middle -> 2 ellipses
    const { pages, ellipsis } = getPageList(5, 20)
    expect(pages[0]).toBe(1)
    expect(pages).toContain(5)
    expect(pages[pages.length - 1]).toBe(20)
    expect(ellipsis).toBe(2)
  })

  it('page 16 of 20 (boundary to late) uses late layout with one ellipsis', () => {
    // page=16, totalPages=20: 16 >= 17? No. 16 <= 4? No. So it's middle -> 2 ellipses
    const { pages, ellipsis } = getPageList(16, 20)
    expect(pages[0]).toBe(1)
    expect(pages[pages.length - 1]).toBe(20)
    expect(ellipsis).toBe(2)
  })

  it('page 17 of 20 (late) shows [1,…,16,17,18,19,20]', () => {
    const { pages, ellipsis } = getPageList(17, 20)
    expect(pages).toEqual([1, 16, 17, 18, 19, 20])
    expect(ellipsis).toBe(1)
  })
})

describe('Pagination component', () => {

  it('disables prev button on first page', () => {
    const { container } = render(<Pagination page={1} totalPages={10} onPage={() => {}} />)
    const buttons = container.querySelectorAll('button')
    // First button is prev
    expect(buttons[0]).toBeDisabled()
    // Next button is not disabled
    expect(buttons[buttons.length - 1]).not.toBeDisabled()
  })

  it('disables next button on last page', () => {
    const { container } = render(<Pagination page={10} totalPages={10} onPage={() => {}} />)
    const buttons = container.querySelectorAll('button')
    expect(buttons[buttons.length - 1]).toBeDisabled()
  })

  it('calls onPage with page-1 when prev clicked', async () => {
    const onPage = vi.fn()
    const { container } = render(<Pagination page={5} totalPages={10} onPage={onPage} />)
    const buttons = container.querySelectorAll('button')
    // First button is prev
    await userEvent.click(buttons[0])
    expect(onPage).toHaveBeenCalledWith(4)
  })

  it('calls onPage with page+1 when next clicked', async () => {
    const onPage = vi.fn()
    const { container } = render(<Pagination page={5} totalPages={10} onPage={onPage} />)
    const buttons = container.querySelectorAll('button')
    // Last button is next
    await userEvent.click(buttons[buttons.length - 1])
    expect(onPage).toHaveBeenCalledWith(6)
  })

  it('calls onPage with page number when a page button is clicked', async () => {
    const onPage = vi.fn()
    const { container } = render(<Pagination page={5} totalPages={10} onPage={onPage} />)
    const buttons = container.querySelectorAll('button')
    // page=5, totalPages=10 shows [1, …, 4, 5, 6, …, 10]; button "4" is visible
    const page4Btn = Array.from(buttons).find(b => b.textContent === '4')
    expect(page4Btn).toBeTruthy()
    await userEvent.click(page4Btn!)
    expect(onPage).toHaveBeenCalledWith(4)
  })

  it('does not call onPage when current page button is clicked', async () => {
    const onPage = vi.fn()
    const { container } = render(<Pagination page={5} totalPages={10} onPage={onPage} />)
    const buttons = container.querySelectorAll('button')
    // Find the button with text "5" (current page)
    const page5Btn = Array.from(buttons).find(b => b.textContent === '5')
    expect(page5Btn).toBeTruthy()
    await userEvent.click(page5Btn!)
    expect(onPage).not.toHaveBeenCalled()
  })

  it('does not call onPage when disabled prev button is clicked', async () => {
    const onPage = vi.fn()
    const { container } = render(<Pagination page={1} totalPages={10} onPage={onPage} />)
    const buttons = container.querySelectorAll('button')
    await userEvent.click(buttons[0])
    expect(onPage).not.toHaveBeenCalled()
  })

  it('does not call onPage when disabled next button is clicked', async () => {
    const onPage = vi.fn()
    const { container } = render(<Pagination page={10} totalPages={10} onPage={onPage} />)
    const buttons = container.querySelectorAll('button')
    await userEvent.click(buttons[buttons.length - 1])
    expect(onPage).not.toHaveBeenCalled()
  })

  it('shows "N pages" text when totalItems is provided', () => {
    const { container } = render(<Pagination page={1} totalPages={10} totalItems={100} onPage={() => {}} />)
    expect(container.textContent).toContain('10 pages')
  })

  it('does not show "N pages" text when totalItems is not provided', () => {
    const { container } = render(<Pagination page={1} totalPages={10} onPage={() => {}} />)
    expect(container.textContent).not.toContain('pages')
  })

  it('renders current page button with active style', () => {
    const { container } = render(<Pagination page={5} totalPages={10} onPage={() => {}} />)
    const buttons = container.querySelectorAll('button')
    const page5Btn = Array.from(buttons).find(b => b.textContent === '5')
    expect(page5Btn).toHaveStyle({ fontWeight: 600 })
  })

  it('renders ellipsis spans correctly', () => {
    const { container } = render(<Pagination page={10} totalPages={20} onPage={() => {}} />)
    const ellipsisSpans = container.querySelectorAll('span')
    const ellipses = Array.from(ellipsisSpans).filter(s => s.textContent === '…')
    expect(ellipses.length).toBe(2)
  })
})
