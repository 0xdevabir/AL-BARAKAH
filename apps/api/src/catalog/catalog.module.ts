import { Body, Controller, Get, Header, Inject, Injectable, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { batchSchema, medicineSchema, zoneSchema } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import type { z } from 'zod';
import { type AuthUser, CurrentUser, Public, RequirePermission } from '../common/auth.js';
import { conflict, notFound, ZodPipe } from '../common/errors.js';
import { PRISMA } from '../common/infra.module.js';

/** Full result pages only when searching; browse is a small popular preview. */
const SEARCH_PAGE = 20;
const BROWSE_PAGE = 12;

interface MedicineRow {
  id: string; slug: string; name: string; genericName: string; manufacturer: string; form: string;
  strength: string; packSize: string; pricePoisha: number; isRx: boolean; description: string;
  imageUrl: string; categoryId: string; stock: bigint | number | null;
}
const toDto = (m: MedicineRow) => ({ ...m, stock: undefined, inStock: Number(m.stock ?? 0) > 0 });

@Injectable()
export class CatalogService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  /**
   * Without a query: a short popularity-ranked preview (home / category chips) — not the full catalogue.
   * With a query: ranked search with pagination; typos tolerated via trigram similarity.
   */
  async search(q: string | undefined, categorySlug: string | undefined, page: number) {
    const term = q?.trim().slice(0, 80) || null;
    const like = term?.replace(/[\\%_]/g, '\\$&') ?? null;
    const browsing = !term;
    const size = browsing ? BROWSE_PAGE : SEARCH_PAGE;
    // Browse is intentionally page 1 only — the rest of the catalogue is reached by searching.
    const offset = browsing ? 0 : (Math.max(page, 1) - 1) * size;
    const rows = await this.prisma.$queryRaw<MedicineRow[]>`
      SELECT m.id, m.slug, m.name, m."genericName", m.manufacturer, m.form, m.strength, m."packSize",
             m."pricePoisha", m."isRx", m.description, m."imageUrl", m."categoryId",
             (SELECT COALESCE(SUM(b."qtyRemaining"), 0) FROM "Batch" b WHERE b."medicineId" = m.id AND b."expiresAt" >= CURRENT_DATE) AS stock
      FROM "Medicine" m
      JOIN "Category" c ON c.id = m."categoryId"
      WHERE m."isActive"
        AND (${categorySlug ?? null}::text IS NULL OR c.slug = ${categorySlug ?? null})
        AND (${term}::text IS NULL
             OR m.name ILIKE '%' || ${like} || '%' OR m."genericName" ILIKE '%' || ${like} || '%'
             OR m.manufacturer ILIKE '%' || ${like} || '%'
             OR m.name % ${term}::text OR m."genericName" % ${term}::text)
      ORDER BY CASE WHEN ${term}::text IS NULL THEN 0
                    WHEN m.name ILIKE ${like} THEN 0
                    WHEN m.name ILIKE ${like} || '%' THEN 1
                    WHEN m."genericName" ILIKE ${like} || '%' THEN 2
                    ELSE 3 END,
               CASE WHEN ${term}::text IS NULL THEN 0
                    ELSE round((1 - GREATEST(similarity(m.name, COALESCE(${term}, '')), similarity(m."genericName", COALESCE(${term}, ''))))::numeric, 1) END,
               m.popularity DESC, m.name, m.strength
      LIMIT ${browsing ? size : size + 1} OFFSET ${offset}`;
    return {
      items: rows.slice(0, size).map(toDto),
      hasMore: browsing ? false : rows.length > size,
    };
  }

  async bySlug(slug: string) {
    const [row] = await this.prisma.$queryRaw<MedicineRow[]>`
      SELECT m.id, m.slug, m.name, m."genericName", m.manufacturer, m.form, m.strength, m."packSize",
             m."pricePoisha", m."isRx", m.description, m."imageUrl", m."categoryId",
             (SELECT COALESCE(SUM(b."qtyRemaining"), 0) FROM "Batch" b WHERE b."medicineId" = m.id AND b."expiresAt" >= CURRENT_DATE) AS stock
      FROM "Medicine" m WHERE m.slug = ${slug} AND m."isActive" LIMIT 1`;
    if (!row) throw notFound('Medicine not found');
    return toDto(row);
  }
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService, @Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Public()
  @Get('medicines')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  list(@Query('q') q?: string, @Query('category') category?: string, @Query('page') page?: string) {
    return this.catalog.search(q, category, Number(page) || 1);
  }

  @Public()
  @Get('medicines/:slug')
  @Header('Cache-Control', 'public, max-age=30, stale-while-revalidate=120')
  one(@Param('slug') slug: string) {
    return this.catalog.bySlug(slug);
  }

  @Public()
  @Get('categories')
  @Header('Cache-Control', 'public, max-age=300')
  async categories() {
    const rows = await this.prisma.category.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, slug: true, _count: { select: { medicines: { where: { isActive: true } } } } },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, count: _count.medicines }));
  }

  @Public()
  @Get('zones')
  @Header('Cache-Control', 'public, max-age=60')
  zones() {
    return this.prisma.zone.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, deliveryFeePoisha: true } });
  }

  @RequirePermission('catalog:manage')
  @Get('admin/medicines')
  async adminList(@Query('q') q?: string) {
    const items = await this.prisma.medicine.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { genericName: { contains: q, mode: 'insensitive' } }] } : {},
      orderBy: { name: 'asc' },
      take: 100,
      include: { batches: { orderBy: { expiresAt: 'asc' } }, category: { select: { name: true } } },
    });
    return items;
  }

  @RequirePermission('catalog:manage')
  @Post('admin/medicines')
  async create(@Body(new ZodPipe(medicineSchema)) body: z.output<typeof medicineSchema>, @CurrentUser() user: AuthUser) {
    const slug = slugify(`${body.name} ${body.strength} ${body.form}`);
    if (await this.prisma.medicine.findUnique({ where: { slug } })) throw conflict('DUPLICATE_MEDICINE', 'This medicine already exists');
    const med = await this.prisma.medicine.create({ data: { ...body, slug } });
    await this.prisma.auditLog.create({ data: { actorId: user.id, action: 'medicine.create', entity: 'Medicine', entityId: med.id } });
    return med;
  }

  @RequirePermission('catalog:manage')
  @Patch('admin/medicines/:id')
  async update(@Param('id') id: string, @Body(new ZodPipe(medicineSchema)) body: z.output<typeof medicineSchema>, @CurrentUser() user: AuthUser) {
    const before = await this.prisma.medicine.findUnique({ where: { id } });
    if (!before) throw notFound('Medicine not found');
    const med = await this.prisma.medicine.update({ where: { id }, data: body });
    await this.prisma.auditLog.create({
      data: { actorId: user.id, action: 'medicine.update', entity: 'Medicine', entityId: id, data: { priceBefore: before.pricePoisha, priceAfter: med.pricePoisha } },
    });
    return med;
  }

  @RequirePermission('catalog:manage')
  @Post('admin/medicines/:id/batches')
  async addBatch(@Param('id') id: string, @Body(new ZodPipe(batchSchema)) body: z.output<typeof batchSchema>, @CurrentUser() user: AuthUser) {
    if (!(await this.prisma.medicine.findUnique({ where: { id } }))) throw notFound('Medicine not found');
    const batch = await this.prisma.batch.upsert({
      where: { medicineId_batchNo: { medicineId: id, batchNo: body.batchNo } },
      update: { qtyRemaining: { increment: body.qty } },
      create: { medicineId: id, batchNo: body.batchNo, expiresAt: new Date(body.expiresAt), qtyRemaining: body.qty },
    });
    await this.prisma.auditLog.create({ data: { actorId: user.id, action: 'batch.add', entity: 'Batch', entityId: batch.id, data: { qty: body.qty } } });
    return batch;
  }

  @RequirePermission('catalog:manage')
  @Get('admin/zones')
  adminZones() {
    return this.prisma.zone.findMany({ orderBy: { name: 'asc' } });
  }

  @RequirePermission('catalog:manage')
  @Post('admin/zones')
  createZone(@Body(new ZodPipe(zoneSchema)) body: z.output<typeof zoneSchema>) {
    return this.prisma.zone.create({ data: body });
  }

  @RequirePermission('catalog:manage')
  @Patch('admin/zones/:id')
  updateZone(@Param('id') id: string, @Body(new ZodPipe(zoneSchema)) body: z.output<typeof zoneSchema>) {
    return this.prisma.zone.update({ where: { id }, data: body });
  }
}

@Module({ controllers: [CatalogController], providers: [CatalogService] })
export class CatalogModule {}
