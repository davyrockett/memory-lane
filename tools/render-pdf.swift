// Renders each page of a PDF to a 1600-px-wide PNG on white (like chart.js does with pdf.js).
//   swift tools/render-pdf.swift <file.pdf> <out-prefix>   ->  <out-prefix>-1.png, -2.png, …
import Foundation
import PDFKit
import AppKit
let args = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: args[1]))!
let outPrefix = args[2]
for i in 0..<doc.pageCount {
  let page = doc.page(at: i)!
  let box = page.bounds(for: .mediaBox)
  let scale = 1600.0 / box.width
  let W = 1600, H = Int((box.height * scale).rounded())
  let cs = CGColorSpaceCreateDeviceRGB()
  let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: 0, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))
  ctx.interpolationQuality = .high
  ctx.scaleBy(x: scale, y: scale)
  ctx.translateBy(x: -box.origin.x, y: -box.origin.y)
  page.draw(with: .mediaBox, to: ctx)
  let img = ctx.makeImage()!
  let rep = NSBitmapImageRep(cgImage: img)
  let data = rep.representation(using: .png, properties: [:])!
  try! data.write(to: URL(fileURLWithPath: "\(outPrefix)-\(i+1).png"))
  print(outPrefix, W, H)
}
